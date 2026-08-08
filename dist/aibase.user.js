// ==UserScript==
// @name         aibase-custom
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  让 AIBase 新闻页面内容区撑满宽度
// @match        https://news.aibase.com/zh/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/aibase.user.ts
  function expandAibaseContent() {
    const styleId = "tm-expand-content";
    const injectStyle = () => {
      if (document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
      .commContainer1090 {
        max-width: none !important;
      }
      [class*="max-w-[728px]"] {
        max-width: none !important;
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
  expandAibaseContent();
})();
