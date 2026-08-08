// ==UserScript==
// @name         aibase-custom
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  让 AIBase 新闻页面内容区撑满宽度
// @match        https://news.aibase.com/zh/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

export {};

// 让内容区撑满宽度
// 两层 max-width 限制需要移除：
// 1. .commContainer1090 — 容器 max-width: 1122px（语义类名，稳定）
// 2. max-w-[728px] — 文章及内容区 max-width: 728px（Tailwind 工具类，多处使用）
// 用属性选择器 [class*="max-w-[728px]"] 统一覆盖所有带此类的元素
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
    subtree: true,
  });
}

expandAibaseContent();
