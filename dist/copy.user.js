// ==UserScript==
// @name         tmjs-enable-copy
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  解除网页复制限制，支持任意内容复制
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/copy.user.ts
  (function enableCopy() {
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
    const interceptCopyEvents = () => {
      const eventsToProtect = ["copy", "cut", "selectstart", "contextmenu", "dragstart"];
      eventsToProtect.forEach((eventType) => {
        document.addEventListener(
          eventType,
          (e) => {
            e.stopPropagation();
          },
          true
        );
      });
    };
    const overrideExecCommand = () => {
      const originalExecCommand = document.execCommand.bind(document);
      document.execCommand = function(commandId, showUI, value) {
        if (commandId === "copy" || commandId === "cut") {
          return originalExecCommand(commandId, showUI, value);
        }
        return originalExecCommand(commandId, showUI, value);
      };
    };
    const ensureSelectionWorks = () => {
      if (window.getSelection) {
        const originalGetSelection = window.getSelection.bind(window);
        window.getSelection = originalGetSelection;
      }
    };
    const observeDynamicStyles = () => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLStyleElement) {
              const cssText = node.textContent || "";
              if (cssText.includes("user-select: none") || cssText.includes("-webkit-user-select: none")) {
                node.textContent = cssText.replace(/user-select:\s*none/g, "user-select: text").replace(/-webkit-user-select:\s*none/g, "-webkit-user-select: text").replace(/-moz-user-select:\s*none/g, "-moz-user-select: text").replace(/-ms-user-select:\s*none/g, "-ms-user-select: text");
              }
            }
          });
        });
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    };
    if (document.head) {
      removeUserSelectRestriction();
    } else {
      document.addEventListener("DOMContentLoaded", removeUserSelectRestriction);
    }
    interceptCopyEvents();
    overrideExecCommand();
    ensureSelectionWorks();
    if (document.body) {
      observeDynamicStyles();
    } else {
      document.addEventListener("DOMContentLoaded", observeDynamicStyles);
    }
  })();
})();
