// ==UserScript==
// @name         feishu-docs-style
// @namespace    *.feishu.cn
// @version      0.1.0
// @description  Detect double-click on page and output to console
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

function main() {
    // 1. 在这里集中编写和追加你的所有 CSS 样式
    const customStyles = `
        /* 1. 基础字体设置 */
        html, body {
            font-family: 'Fira Code' !important;
        }

        /* 2. 后面你可以在这里直接追加新样式，例如： */
        /* 修改正文颜色 */
        /* body { color: #333 !important; } */

        /* 修改飞书某些特定组件的背景（举例） */
        /* .feishu-component { background: #f5f5f5 !important; } */
    `;

    // 2. 统一注入到页面中
    const styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    styleElement.appendChild(document.createTextNode(customStyles));
    document.documentElement.appendChild(styleElement);
}

main();
