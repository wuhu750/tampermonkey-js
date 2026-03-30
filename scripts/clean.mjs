import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outDir = path.resolve(rootDir, "dist");

await rm(outDir, { recursive: true, force: true });
console.log("Cleaned dist/");

