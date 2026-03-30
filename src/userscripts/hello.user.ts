// ==UserScript==
// @name         tmjs-hello
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  Demo userscript with sourcemap debugging
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

export {};

function main() {
  const el = document.createElement("div");

  console.log(666)
  el.textContent = "Hello from Tampermonkey (tmjs-hello)";
  el.style.cssText =
    "position:fixed;z-index:999999;bottom:16px;right:16px;padding:10px 12px;" +
    "background:#111;color:#fff;border-radius:10px;font:14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto;";
  document.documentElement.appendChild(el);

  // Put a breakpoint here to verify sourcemaps.
  console.log("[tmjs-hello] injected at", new Date().toISOString());
}

main();


