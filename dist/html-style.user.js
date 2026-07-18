// ==UserScript==
// @name         feishu-docs-style
// @namespace    *.feishu.cn
// @version      0.1.0
// @description  Detect double-click on page and output to console
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/html-style.user.ts
  function main() {
    const customStyles = `
        /* 1. \u57FA\u7840\u5B57\u4F53\u8BBE\u7F6E */
        html, body {
            font-family: 'Fira Code' !important;
        }

        /* 2. \u540E\u9762\u4F60\u53EF\u4EE5\u5728\u8FD9\u91CC\u76F4\u63A5\u8FFD\u52A0\u65B0\u6837\u5F0F\uFF0C\u4F8B\u5982\uFF1A */
        /* \u4FEE\u6539\u6B63\u6587\u989C\u8272 */
        /* body { color: #333 !important; } */

        /* \u4FEE\u6539\u98DE\u4E66\u67D0\u4E9B\u7279\u5B9A\u7EC4\u4EF6\u7684\u80CC\u666F\uFF08\u4E3E\u4F8B\uFF09 */
        /* .feishu-component { background: #f5f5f5 !important; } */
    `;
    const styleElement = document.createElement("style");
    styleElement.type = "text/css";
    styleElement.appendChild(document.createTextNode(customStyles));
    document.documentElement.appendChild(styleElement);
  }
  main();
})();
