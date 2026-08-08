// ==UserScript==
// @name         zhihu-custom
// @namespace    https://example.local/tmjs
// @version      0.1.0
// @description  在知乎页面自动移除未登录弹出的登录弹窗，用于避免阅读被频繁打断
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @match        https://blog.csdn.net/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

export {};

function zhihuModal() {
  const MODAL_SELECTOR = "div.Modal-wrapper.Modal-enter-done, div.Modal-wrapper.undefined.Modal-enter-done";

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

// 修改知乎文章内容区域宽度
function zhihuPostContent() {
  const postContentSelector = "div.Post-content";
  const postContent = document.querySelector<HTMLDivElement>(postContentSelector);
  if (!postContent) return;

  const postContentSubElement = postContent.children[2] as HTMLElement;
  if (!postContentSubElement) return;

  postContentSubElement.style.width = "100%";
  const postContentSubChild = postContentSubElement.firstElementChild as HTMLElement | null;
  if (postContentSubChild) {
    postContentSubChild.style.width = "100%";
    postContentSubChild.querySelectorAll<HTMLImageElement>("img[width]").forEach((img) => {
      img.style.width = "auto"
    });
  }
  postContent.style.width = "100%";

  const observerContent = new MutationObserver(() => {
    postContent.style.width = "100%";
  });
  observerContent.observe(postContent, {
    childList: true,
    subtree: true,
  });
}

// 隐藏右下角"登录即可查看"小弹窗（类名为打包工具随机生成，按文本内容+固定定位匹配）
function zhihuLoginPrompt() {
  const hidePrompt = () => {
    document.querySelectorAll("div").forEach((el) => {
      if (el.style.display === "none") return;
      if (!el.textContent?.includes("登录即可查看")) return;
      if (window.getComputedStyle(el).position !== "fixed") return;
      el.style.display = "none";
    });
  };

  hidePrompt();

  const observer = new MutationObserver(hidePrompt);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

zhihuPostContent();
zhihuModal();
zhihuLoginPrompt();
