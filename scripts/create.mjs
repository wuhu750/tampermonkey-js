import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userscriptsDir = path.resolve(rootDir, "src", "userscripts");

function printUsage() {
  console.log("Usage:");
  console.log("  npm run create -- <script-name>");
  console.log("");
  console.log("Example:");
  console.log("  npm run create -- bilibili-helper");
}

function normalizeName(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

function isValidName(name) {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

function template(name) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  TODO: describe what this script does
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

export {};

function main() {
  // TODO: implement script logic.
  console.log("[${name}] loaded", new Date().toISOString());
}

main();
`;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const name = normalizeName(input);
  if (!isValidName(name)) {
    console.error(`Invalid script name: "${input}"`);
    console.error("Allowed characters: a-z, 0-9, and '-'");
    process.exitCode = 1;
    return;
  }

  await mkdir(userscriptsDir, { recursive: true });
  const filePath = path.resolve(userscriptsDir, `${name}.user.ts`);
  if (await fileExists(filePath)) {
    console.error(`Script already exists: src/userscripts/${name}.user.ts`);
    process.exitCode = 1;
    return;
  }

  await writeFile(filePath, template(name), "utf8");
  console.log(`Created src/userscripts/${name}.user.ts`);
  console.log("Next steps:");
  console.log("  1) Update @match and @description in metadata");
  console.log("  2) Run npm run dev (or restart dev if it is already running)");
  console.log(`  3) Install dist/${name}.dev.user.js in Tampermonkey`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

