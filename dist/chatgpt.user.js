// ==UserScript==
// @name         chatgpt-custom
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  让 ChatGPT 对话内容撑满页面宽度
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/chatgpt.user.ts
  function expandChatGPTContent() {
    const styleId = "tm-expand-content";
    const injectStyle = () => {
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
      main, main * {
        --thread-content-max-width: none !important;
        --thread-content-margin: 0px !important;
      }
    `;
      (document.head || document.documentElement).appendChild(style);
    };
    injectStyle();
    new MutationObserver(injectStyle).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  expandChatGPTContent();
})();
