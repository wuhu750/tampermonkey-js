// ==UserScript==
// @name         dblclick-auto-trancy
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  Detect double-click on page and output to console
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

export {};

function main() {
  document.addEventListener('dblclick', () => {
    setTimeout(() => {
      const btn = document.getElementById('trancy-button');
      if (btn) {
        const shadowRoot = btn?.querySelector('div')?.shadowRoot;
        if (shadowRoot) {
          const translatorBtn = shadowRoot.querySelector('.rd-translator-btn') as HTMLElement;
          if (translatorBtn) {
            translatorBtn.click();
          }
        }
      }
    }, 1000);
  });
}

main();