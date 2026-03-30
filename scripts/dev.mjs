import { context } from "esbuild";
import { watch as fsWatch } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.resolve(rootDir, "src", "userscripts");
const outDir = path.resolve(rootDir, "dist");
const requestedPort = Number.parseInt(process.env.PORT ?? "5173", 10);

function isUserscriptFile(name) {
  return name.endsWith(".user.ts") || name.endsWith(".user.js");
}

function stripUserscriptBlock(sourceText) {
  const start = sourceText.indexOf("// ==UserScript==");
  if (start === -1) return { meta: "", body: sourceText };
  const end = sourceText.indexOf("// ==/UserScript==");
  if (end === -1) return { meta: "", body: sourceText };
  const afterEnd = end + "// ==/UserScript==".length;
  const meta = sourceText.slice(start, afterEnd).trimEnd() + "\n";
  const body = sourceText.slice(afterEnd);
  return { meta, body };
}

function inferBaseName(entryPath) {
  const base = path.basename(entryPath);
  return base.replace(/\.user\.(ts|js)$/i, "");
}

async function listEntries() {
  const names = await readdir(srcDir);
  return names.filter(isUserscriptFile).map((n) => path.resolve(srcDir, n));
}

async function ensureCleanOutDir() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".map")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function makeBuildLoggerPlugin(baseName) {
  let startedAt = 0;
  return {
    name: `build-logger-${baseName}`,
    setup(build) {
      build.onStart(() => {
        startedAt = Date.now();
        console.log(`[${nowTime()}] [${baseName}] build start`);
      });
      build.onEnd((result) => {
        const durationMs = Date.now() - startedAt;
        const status = result.errors.length === 0 ? "success" : "failed";
        console.log(
          `[${nowTime()}] [${baseName}] build ${status} (${durationMs}ms, errors: ${result.errors.length})`
        );
      });
    }
  };
}

async function listenServerWithFallback(server, startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = startPort + i;
    const result = await new Promise((resolve) => {
      const onError = (err) => resolve({ ok: false, err });
      const onListening = () => resolve({ ok: true });

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate);
    });

    if (result.ok) {
      if (candidate !== startPort) {
        console.warn(`Port ${startPort} is in use, fallback to ${candidate}.`);
      }
      return candidate;
    }

    if (result.err?.code !== "EADDRINUSE") {
      throw result.err;
    }
  }

  throw new Error(
    `No available port found in range ${startPort}-${startPort + maxAttempts - 1}`
  );
}

async function writeIndex(entries, port) {
  const lines = [
    "Tampermonkey dev server is running.",
    "",
    "Install these dev stubs in Tampermonkey (open the file in browser):",
    ...entries.map((e) => `- dist/${inferBaseName(e)}.dev.user.js`),
    "",
    "Each dev stub uses @require with a file:// URL pointing at dist/<name>.user.js on this machine.",
    "If Tampermonkey blocks it, enable local file access for the extension (or install from the served URL below).",
    "",
    "Served files (optional, for opening in browser):",
    ...entries.flatMap((e) => {
      const base = inferBaseName(e);
      return [
        `- http://localhost:${port}/${base}.user.js`,
        `- http://localhost:${port}/${base}.user.js.map`
      ];
    })
  ];
  await writeFile(path.resolve(outDir, "index.txt"), lines.join("\n") + "\n", "utf8");
}

async function writeDevStub(entryPath) {
  const baseName = inferBaseName(entryPath);
  const srcText = await readFile(entryPath, "utf8");
  const { meta } = stripUserscriptBlock(srcText);
  if (!meta) throw new Error(`Missing userscript metadata block in ${entryPath}`);

  const bundlePath = path.resolve(outDir, `${baseName}.user.js`);
  const requireLine = `// @require      ${pathToFileURL(bundlePath).href}`;

  const metaLines = meta
    .trimEnd()
    .split("\n")
    .filter((l) => !l.startsWith("// @require") && !l.startsWith("// @updateURL") && !l.startsWith("// @downloadURL"));

  // Insert @require (local bundle) just before the closing marker.
  const closingIdx = metaLines.findIndex((l) => l.trim() === "// ==/UserScript==");
  if (closingIdx === -1) throw new Error(`Invalid metadata block in ${entryPath}`);
  metaLines.splice(closingIdx, 0, requireLine);

  const stub = `${metaLines.join("\n")}\n\n(() => {\n  'use strict';\n  console.log('[tmjs] dev stub loaded: ${baseName}');\n})();\n`;
  const outStub = path.resolve(outDir, `${baseName}.dev.user.js`);
  await writeFile(outStub, stub, "utf8");
}

function createDevServer(port) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const pathname = decodeURIComponent(url.pathname);
      const rel = pathname.replace(/^\//, "");
      const filePath = path.resolve(outDir, rel || "index.txt");

      // Prevent path traversal.
      if (!filePath.startsWith(outDir + path.sep) && filePath !== path.join(outDir, "index.txt")) {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      const data = await readFile(filePath);
      res.setHeader("Content-Type", contentType(filePath));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.writeHead(200);
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

function startSourceWatcher(entries) {
  const debounceMap = new Map();
  const watchers = entries.map((entryPath) => {
    const filename = path.basename(entryPath);
    const watcher = fsWatch(entryPath, (eventType) => {
      const now = Date.now();
      const key = `${eventType}:${filename}`;
      const prev = debounceMap.get(key) ?? 0;
      if (now - prev < 120) return;
      debounceMap.set(key, now);
      console.log(`[${nowTime()}] [watch] ${eventType} -> src/userscripts/${filename}`);
    });
    watcher.on("error", (err) => {
      console.warn(`[watch] source watcher error (${filename}): ${err.message}`);
    });
    return watcher;
  });
  return {
    close() {
      for (const watcher of watchers) watcher.close();
    }
  };
}

async function main() {
  await ensureCleanOutDir();
  const entries = await listEntries();
  if (entries.length === 0) {
    console.log("No userscripts found in src/userscripts/*.user.(ts|js)");
    return;
  }

  const ctxs = await Promise.all(
    entries.map(async (entryPath) => {
      const baseName = inferBaseName(entryPath);
      await writeDevStub(entryPath);

      const outfile = path.resolve(outDir, `${baseName}.user.js`);
      const ctx = await context({
        entryPoints: [entryPath],
        outfile,
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["chrome110"],
        sourcemap: "external",
        sourcesContent: true,
        legalComments: "none",
        banner: {
          js: (await readFile(entryPath, "utf8")).match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?/m)?.[0] ?? ""
        },
        logLevel: "silent",
        plugins: [makeBuildLoggerPlugin(baseName)]
      });
      await ctx.rebuild();
      await ctx.watch();
      console.log(`Watching src/userscripts/${path.basename(entryPath)} → dist/${baseName}.user.js`);
      return ctx;
    })
  );

  const server = createDevServer(requestedPort);
  const activePort = await listenServerWithFallback(server, requestedPort);
  await Promise.all(entries.map((entryPath) => writeDevStub(entryPath)));
  await writeIndex(entries, activePort);
  const sourceWatcher = startSourceWatcher(entries);
  console.log(`Dev server: http://localhost:${activePort}/`);

  process.on("SIGINT", async () => {
    await Promise.allSettled(ctxs.map((c) => c.dispose()));
    sourceWatcher.close();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

