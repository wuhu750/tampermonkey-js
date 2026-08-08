// ==UserScript==
// @name         csdn-custom-login-modal
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  在csdn博客页面自动移除未登录弹出的登录弹窗，用于避免阅读被频繁打断
// @match        https://blog.csdn.net/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

export {};

function csdn() {
  const MODAL_SELECTOR = "div.passport-login-container";

  const removeLoginModal = () => {
    const modals = document.querySelectorAll<HTMLDivElement>(MODAL_SELECTOR);
    if (modals.length === 0) return;

    modals.forEach((modal) => modal.remove());
    document.body.style.overflow = "";
    document.documentElement.removeAttribute("style");
  };

  removeLoginModal();

  const observer = new MutationObserver(() => {
    removeLoginModal();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

}

csdn();
