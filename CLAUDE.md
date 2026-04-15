# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Tampermonkey userscript development scaffold supporting **multiple userscripts**, **dev mode** with local loading, and **sourcemap debugging** directly in Chrome DevTools.

## Commands

```bash
npm run dev      # Start watch + local dev server (default port 5173)
npm run build    # Production build to dist/
npm run create -- <name>   # Create new script (name: a-z, 0-9, -)
npm run clean    # Clean dist/
npm run typecheck # TypeScript type checking
```

## Architecture

- `src/userscripts/*.user.ts` — Each file is an independent userscript. Files must start with a `// ==UserScript==` metadata block (lines 1-9 of the template).
- `scripts/` — Build tooling (esbuild-based). `dev.mjs` handles watch mode + dev server; `build.mjs` does production builds; `create.mjs` scaffolds new scripts.
- `dist/` — Build output:
  - `*.user.js` — Bundled IIFE script (for production install)
  - `*.user.js.map` — External sourcemap
  - `*.dev.user.js` — Dev stub; install this in Tampermonkey, it uses `@require` to load the bundled script from `localhost:5173`

## Dev Workflow

1. Run `npm run dev`
2. Open `dist/index.txt` (or the served URL) and install `*.dev.user.js` stubs in Tampermonkey
3. In Chrome DevTools → Sources → `localhost:5173`, open `*.user.ts` files to set breakpoints

The dev server extracts the userscript metadata block from each `.user.ts` file and generates `.dev.user.js` stubs. It also rebuilds and watches the bundled `.user.js` files with sourcemaps enabled.

## Script Naming

When creating a new script via `npm run create -- <name>`, the name must:
- Use only `a-z`, `0-9`, and `-`
- Start with a letter or number
- Become the filename: `src/userscripts/<name>.user.ts`

## TypeScript

The `tsconfig.json` targets ES2022 with DOM types. No external type packages are used — Tampermonkey APIs are implicit via the DOM lib.
