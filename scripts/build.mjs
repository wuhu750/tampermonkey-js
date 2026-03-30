import { build } from "esbuild";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.resolve(rootDir, "src", "userscripts");
const outDir = path.resolve(rootDir, "dist");

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

async function buildOne(entryPath) {
  const srcText = await readFile(entryPath, "utf8");
  const { meta } = stripUserscriptBlock(srcText);
  if (!meta) {
    throw new Error(
      `Missing userscript metadata block in ${path.relative(rootDir, entryPath)}`
    );
  }

  const baseName = inferBaseName(entryPath);
  const outfile = path.resolve(outDir, `${baseName}.user.js`);
  const mapfile = `${outfile}.map`;

  const result = await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome110"],
    sourcemap: "external",
    sourcesContent: true,
    legalComments: "none",
    logLevel: "silent",
    banner: {
      js: meta,
    }
  });

  if (result.errors?.length) {
    throw new Error(`Build failed for ${baseName}`);
  }

  // Ensure Tampermonkey sees correct sourcemap URL in devtools.
  // esbuild already appends //# sourceMappingURL=... but we keep it as-is.
  await readFile(mapfile, "utf8");
}

async function main() {
  await ensureCleanOutDir();
  const entries = await listEntries();
  if (entries.length === 0) {
    console.log("No userscripts found in src/userscripts/*.user.(ts|js)");
    return;
  }

  for (const entry of entries) {
    await buildOne(entry);
    const baseName = inferBaseName(entry);
    console.log(`Built dist/${baseName}.user.js`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

