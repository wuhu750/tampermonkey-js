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

            setTimeout(() => {
              // 使用 querySelector 配合 id 选择器，如果有多个相同 id，取第一个（或根据需要调整）
              const controlCenter = document.querySelector('xt-card') as HTMLElement;
              const cardShadowRoot = controlCenter?.querySelector('div')?.shadowRoot;
              const voiceBtn = cardShadowRoot?.querySelector('.icon-voice') as HTMLElement;
              voiceBtn?.click();
            }, 1000);
          }
        }
      }
    }, 1000);
  });
}

main();