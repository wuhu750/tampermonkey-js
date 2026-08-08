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

export {};

// 让对话内容撑满宽度
// ChatGPT 通过 Tailwind CSS 变量 --thread-content-max-width（40rem/48rem）限制内容最大宽度，
// 通过 --thread-content-margin 控制左右内边距。这些变量由 Tailwind 工具类设置（编译为 CSS 规则），
// 用 !important 注入 <style> 标签即可覆盖。@w-lg/main: 容器查询名称确认外层为 <main> 元素。
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
    subtree: true,
  });
}

expandChatGPTContent();
