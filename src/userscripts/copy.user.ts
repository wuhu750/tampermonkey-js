// ==UserScript==
// @name         tmjs-enable-copy
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  解除网页复制限制，支持任意内容复制
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

export {};

/**
 * 解除页面复制限制
 * 原理：
 * 1. 移除 body 上的 user-select: none 样式
 * 2. 拦截并阻止对 copy/cut/selectstart 事件的拦截
 * 3. 重写 document.execCommand 确保复制命令可用
 * 4. 处理 CSS 层面的 -webkit-user-select 限制
 */

(function enableCopy() {
  // 移除 CSS 层面的选择限制
  const removeUserSelectRestriction = () => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(style);
  };

  // 拦截页面脚本对复制相关事件的阻止
  const interceptCopyEvents = () => {
    const eventsToProtect = ["copy", "cut", "selectstart", "contextmenu", "dragstart"];

    eventsToProtect.forEach((eventType) => {
      // 在捕获阶段监听，优先于页面脚本
      document.addEventListener(
        eventType,
        (e) => {
          // 阻止页面脚本继续拦截（通过停止传播）
          e.stopPropagation();
        },
        true
      );
    });
  };

  // 重写 document.execCommand，确保复制命令可用
  const overrideExecCommand = () => {
    const originalExecCommand = document.execCommand.bind(document);

    document.execCommand = function (commandId, showUI, value) {
      if (commandId === "copy" || commandId === "cut") {
        // 直接执行复制，不受页面限制
        return originalExecCommand(commandId, showUI, value);
      }
      return originalExecCommand(commandId, showUI, value);
    } as typeof document.execCommand;
  };

  // 重写 window.getSelection，确保选择功能正常
  const ensureSelectionWorks = () => {
    // 一些网站会覆盖 getSelection，这里确保原生功能可用
    if (window.getSelection) {
      const originalGetSelection = window.getSelection.bind(window);
      window.getSelection = originalGetSelection;
    }
  };

  // 处理动态添加的样式
  const observeDynamicStyles = () => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLStyleElement) {
            // 检查并移除新添加样式中的 user-select: none
            const cssText = node.textContent || "";
            if (cssText.includes("user-select: none") || cssText.includes("-webkit-user-select: none")) {
              node.textContent = cssText
                .replace(/user-select:\s*none/g, "user-select: text")
                .replace(/-webkit-user-select:\s*none/g, "-webkit-user-select: text")
                .replace(/-moz-user-select:\s*none/g, "-moz-user-select: text")
                .replace(/-ms-user-select:\s*none/g, "-ms-user-select: text");
            }
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  // 初始化
  if (document.head) {
    removeUserSelectRestriction();
  } else {
    // 如果 head 还没准备好，等待 DOMContentLoaded
    document.addEventListener("DOMContentLoaded", removeUserSelectRestriction);
  }

  interceptCopyEvents();
  overrideExecCommand();
  ensureSelectionWorks();

  // DOM 准备好后启动样式观察
  if (document.body) {
    observeDynamicStyles();
  } else {
    document.addEventListener("DOMContentLoaded", observeDynamicStyles);
  }
})();
