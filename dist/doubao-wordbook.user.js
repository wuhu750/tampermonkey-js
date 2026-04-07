// ==UserScript==
// @name         tmjs-doubao-wordbook
// @namespace    https://example.local/tmjs
// @version      0.2.9
// @description  在豆包翻译弹窗操作栏增加「生词本」按钮，保存 data-testid=stream-message-done 的翻译内容到本地，并支持导出 JSON 与 Markdown；数据使用 GM 存储，全浏览器站点共享
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/doubao-wordbook.user.ts
  function gm() {
    return globalThis;
  }
  var STORAGE_KEY = "tmjs-doubao-wordbook-v1";
  var UI_COLLAPSED_KEY = "tmjs-doubao-wordbook-bar-collapsed";
  function hasGmStorage() {
    const g = gm();
    return typeof g.GM_getValue === "function" && typeof g.GM_setValue === "function";
  }
  function readRawStore() {
    if (hasGmStorage()) {
      const g = gm();
      const v = g.GM_getValue(STORAGE_KEY);
      if (v != null && v !== "") {
        return v;
      }
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          g.GM_setValue(STORAGE_KEY, parsed);
          localStorage.removeItem(STORAGE_KEY);
          return parsed;
        }
      } catch {
      }
      return null;
    }
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (!ls) return null;
      return JSON.parse(ls);
    } catch {
      return null;
    }
  }
  function normalizeStorePayload(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === "string") {
      try {
        const o = JSON.parse(raw);
        if (typeof o === "object" && o !== null && !Array.isArray(o)) {
          return o;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  function readBarCollapsed() {
    if (hasGmStorage()) {
      const v = gm().GM_getValue(UI_COLLAPSED_KEY);
      if (typeof v === "boolean") return v;
      if (v === true || v === 1 || v === "1" || v === "true") return true;
      if (v === false || v === 0 || v === "0" || v === "false") return false;
      return false;
    }
    try {
      return localStorage.getItem(UI_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  }
  function saveBarCollapsed(collapsed) {
    if (hasGmStorage()) {
      gm().GM_setValue(UI_COLLAPSED_KEY, collapsed);
      return;
    }
    try {
      localStorage.setItem(UI_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
    }
  }
  var BAR_POSITION_STYLE = "position:fixed;z-index:2147483646;right:12px;bottom:12px;display:flex;flex-direction:column;";
  var ICON_BTN_BASE = "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid #e5e7eb;background:#fff;color:#374151;box-shadow:0 2px 12px rgba(0,0,0,.12);";
  function svgIcon(paths, sizePx = 20) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }
  var SVG_CHEVRON_UP = svgIcon('<path d="m18 15-6-6-6 6"/>', 10);
  var SVG_CHEVRON_DOWN = svgIcon('<path d="m6 9 6 6 6-6"/>');
  var SVG_CLOSE_SM = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 10);
  var SVG_CLOSE_MD = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 14);
  function applyBarCollapsedDom(bar, collapsed) {
    const collapsedWrap = bar.querySelector("[data-tmjs-bar-collapsed-wrap]");
    const panel = bar.querySelector("[data-tmjs-bar-expanded]");
    if (collapsedWrap) collapsedWrap.style.display = collapsed ? "inline-flex" : "none";
    if (panel) panel.style.display = collapsed ? "none" : "flex";
    if (collapsed) {
      bar.setAttribute(
        "style",
        BAR_POSITION_STYLE + "align-items:flex-end;padding:0;background:transparent;border:none;box-shadow:none;max-width:none;"
      );
    } else {
      bar.setAttribute(
        "style",
        BAR_POSITION_STYLE + "gap:6px;align-items:stretch;padding:8px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:min(420px,92vw);"
      );
    }
    bar.dataset.collapsed = collapsed ? "1" : "0";
  }
  function isTopWindow() {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  }
  var toastHideTimer = 0;
  var floatingBarDismissedForPage = false;
  function dismissFloatingBarForPage() {
    floatingBarDismissedForPage = true;
    document.getElementById("tmjs-doubao-wordbook-bar")?.remove();
  }
  var observedMutationRoots = /* @__PURE__ */ new WeakSet();
  function loadStore() {
    try {
      const raw = readRawStore();
      const parsed = normalizeStorePayload(raw);
      if (!parsed || !Array.isArray(parsed.entries)) {
        return { version: 2, entries: [] };
      }
      const entries = parsed.entries.map((e) => migrateEntryToV2(e));
      const result = { version: 2, entries };
      if (parsed.version !== 2 || parsed.entries.some((e) => !isV2Entry(e))) {
        saveStore(result);
      }
      return result;
    } catch {
      return { version: 2, entries: [] };
    }
  }
  function migrateEntryToV2(e) {
    if (isV2Entry(e)) return e;
    const old = e;
    const hint = (old.word ?? "").trim();
    if (old.translationHtml) {
      const wrap = document.createElement("div");
      wrap.innerHTML = old.translationHtml;
      const parsed = parseDoubaoTranslation(wrap, hint);
      return {
        id: old.id,
        savedAt: old.savedAt,
        pageUrl: old.pageUrl,
        pageTitle: old.pageTitle,
        ...parsed
      };
    }
    if (old.translationText) {
      return {
        id: old.id,
        savedAt: old.savedAt,
        pageUrl: old.pageUrl,
        pageTitle: old.pageTitle,
        \u5355\u8BCD: hint,
        \u7FFB\u8BD1: "",
        \u89E3\u91CA: old.translationText,
        \u8BCD\u6027: "",
        \u97F3\u6807: "",
        \u5E38\u89C1\u642D\u914D: "",
        \u4F8B\u53E5: ""
      };
    }
    return {
      id: old.id ?? randomId(),
      savedAt: old.savedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      pageUrl: old.pageUrl ?? "",
      pageTitle: old.pageTitle ?? "",
      \u5355\u8BCD: hint,
      \u7FFB\u8BD1: "",
      \u89E3\u91CA: "",
      \u8BCD\u6027: "",
      \u97F3\u6807: "",
      \u5E38\u89C1\u642D\u914D: "",
      \u4F8B\u53E5: ""
    };
  }
  function isV2Entry(e) {
    if (!e || typeof e !== "object") return false;
    const o = e;
    return typeof o["\u5355\u8BCD"] === "string" && typeof o["\u7FFB\u8BD1"] === "string" && typeof o["\u89E3\u91CA"] === "string" && !("translationHtml" in o && o["translationHtml"]);
  }
  function saveStore(store) {
    if (hasGmStorage()) {
      gm().GM_setValue(STORAGE_KEY, store);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
    }
  }
  function randomId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function formatSavedAtLocal(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }
  function setPreviewTableCellContent(td, raw, multiline) {
    const base = "padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;word-break:break-word;max-width:220px;";
    if (multiline) {
      const text = String(raw ?? "").replace(/\r\n/g, "\n").replace(/<br\s*\/?>/gi, "\n");
      td.textContent = text;
      td.style.cssText = base + "white-space:pre-wrap;";
    } else {
      td.textContent = raw;
      td.style.cssText = base;
    }
  }
  function parseDoubaoTranslation(rootEl, wordHint) {
    const body = rootEl.querySelector("[class*='flow-markdown-body']") ?? rootEl.querySelector(".flow-markdown-body") ?? rootEl;
    const firstBlock = body.querySelector("[class*='paragraph-element'], .paragraph-element, p") ?? body.firstElementChild;
    let \u89E3\u91CA = "";
    let \u7FFB\u8BD1 = "";
    let \u97F3\u6807 = "";
    if (firstBlock) {
      let raw = (firstBlock.textContent ?? "").replace(/\s+/g, " ").trim();
      const inlinePh = raw.match(/\s*音标\s*[：:]\s*(.+)$/);
      if (inlinePh) {
        \u97F3\u6807 = inlinePh[1].trim();
        raw = raw.slice(0, inlinePh.index).trim();
      }
      \u89E3\u91CA = raw;
      const strs = [];
      firstBlock.querySelectorAll("strong").forEach((s) => {
        const v = s.textContent?.trim();
        if (v && v !== "\u97F3\u6807") strs.push(v);
      });
      \u7FFB\u8BD1 = strs.join("\u3001");
    }
    const olLines = [];
    body.querySelectorAll("ol > li").forEach((li) => {
      const text = (li.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (/(动词|名词|形容词|副词|介词|连词|数词|冠词|\([nva]\.\)|\(adj\.\)|\(adv\.\))/.test(text)) {
        olLines.push(text);
      }
    });
    let \u8BCD\u6027 = "";
    const colloqLines = [];
    const exampleLines = [];
    let phase = "normal";
    for (const li of Array.from(body.querySelectorAll("ul > li"))) {
      const text = (li.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (/词性\s*[：:]/.test(text)) {
        \u8BCD\u6027 = text.replace(/^.*?词性\s*[：:]\s*/, "").trim();
        phase = "normal";
        continue;
      }
      if (!\u97F3\u6807 && (/^音标\s*[：:]/.test(text) || /音标/.test(text) && /[：:]/.test(text))) {
        \u97F3\u6807 = text.replace(/^.*?音标\s*[：:]\s*/, "").trim();
        phase = "normal";
        continue;
      }
      if (/常见搭配\s*[：:]?\s*$/.test(text) || text === "\u5E38\u89C1\u642D\u914D" || text === "\u5E38\u89C1\u642D\u914D\uFF1A") {
        phase = "collocations";
        continue;
      }
      if (/^搭配\s*[：:]/.test(text)) {
        colloqLines.push(text.replace(/^搭配\s*[：:]\s*/, "").trim());
        phase = "normal";
        continue;
      }
      if (/例句\s*[：:]/.test(text)) {
        exampleLines.push(text.replace(/^.*?例句\s*[：:]\s*/, "").trim());
        phase = "normal";
        continue;
      }
      if (phase === "collocations") {
        colloqLines.push(text);
      }
    }
    if (olLines.length > 0) {
      \u8BCD\u6027 = \u8BCD\u6027 ? `${\u8BCD\u6027}
${olLines.join("\n")}` : olLines.join("\n");
    }
    const \u4F8B\u53E5 = exampleLines.join("\n");
    const \u5355\u8BCD = wordHint.trim() || guessWordFromExplanation(\u89E3\u91CA);
    return {
      \u5355\u8BCD,
      \u7FFB\u8BD1,
      \u89E3\u91CA,
      \u8BCD\u6027,
      \u97F3\u6807,
      \u5E38\u89C1\u642D\u914D: colloqLines.join("\n"),
      \u4F8B\u53E5
    };
  }
  function guessWordFromExplanation(s) {
    const m = s.match(/[「『"'“‘]?([a-zA-Z][a-zA-Z\-']*)/);
    return m ? m[1] : "";
  }
  function queryDeepWithin(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.shadowRoot) {
        const inner = queryDeepWithin(el.shadowRoot, selector);
        if (inner) return inner;
      }
    }
    return null;
  }
  function queryDeepDocument(selector) {
    return queryDeepWithin(document, selector);
  }
  function findStreamMessageDone(from) {
    const rootNode = from.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      const hit = queryDeepWithin(rootNode, '[data-testid="stream-message-done"]');
      if (hit) return hit;
    }
    return queryDeepDocument('[data-testid="stream-message-done"]');
  }
  function extractWordFromPanel(doneEl) {
    const panel = doneEl.closest('[class*="inner-"]') || doneEl.closest(".stream-message-container-qDS1M6")?.parentElement || doneEl.parentElement?.parentElement?.parentElement;
    const wordEl = panel?.querySelector("[class*='select-content']");
    const t = wordEl?.textContent?.trim();
    return t || "";
  }
  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  var MD_FIELDS = ["\u5355\u8BCD", "\u7FFB\u8BD1", "\u89E3\u91CA", "\u8BCD\u6027", "\u97F3\u6807", "\u5E38\u89C1\u642D\u914D", "\u4F8B\u53E5"];
  function mdEscapeCell(s) {
    return s.replace(/\|/g, "\\|").replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  }
  var PREVIEW_MODAL_ID = "tmjs-doubao-wordbook-preview";
  var PREVIEW_SCROLL_MAX_HEIGHT = "min(65vh, 480px)";
  function normalizeWordKey(word) {
    return word.trim().toLowerCase();
  }
  function countWordOccurrences(entries) {
    const map = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const k = normalizeWordKey(e.\u5355\u8BCD);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }
  function openWordbookPreviewModal() {
    if (!isTopWindow()) return;
    document.getElementById(PREVIEW_MODAL_ID)?.remove();
    const store = loadStore();
    const backdrop = document.createElement("div");
    backdrop.id = PREVIEW_MODAL_ID;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "\u751F\u8BCD\u672C\u5185\u5BB9");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
    const stopBackdropClose = (e) => e.stopPropagation();
    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    backdrop.addEventListener("click", () => close());
    const panel = document.createElement("div");
    panel.style.cssText = "background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.22);max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;";
    panel.addEventListener("click", stopBackdropClose);
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;";
    const title = document.createElement("div");
    title.style.cssText = "font:600 15px/1.3 system-ui,sans-serif;color:#111827;";
    title.textContent = `\u751F\u8BCD\u672C\u5185\u5BB9\uFF08${store.entries.length} \u6761\uFF09`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "\u5173\u95ED";
    closeBtn.style.cssText = "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #d1d5db;background:#fff;font:13px system-ui,sans-serif;";
    closeBtn.addEventListener("click", close);
    header.appendChild(title);
    header.appendChild(closeBtn);
    const scrollWrap = document.createElement("div");
    scrollWrap.style.cssText = `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;`;
    if (store.entries.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "margin:0;color:#6b7280;font:13px/1.5 system-ui,sans-serif;";
      empty.textContent = "\u6682\u65E0\u8BCD\u6761\uFF0C\u8BF7\u5148\u5728\u8C46\u5305\u7FFB\u8BD1\u91CC\u52A0\u5165\u751F\u8BCD\u672C\u3002";
      scrollWrap.appendChild(empty);
    } else {
      const wordOccurrences = countWordOccurrences(store.entries);
      const table = document.createElement("table");
      table.style.cssText = "width:100%;min-width:720px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#111827;";
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      const heads = ["#", "\u5355\u8BCD", "\u7FFB\u8BD1", "\u89E3\u91CA", "\u8BCD\u6027", "\u97F3\u6807", "\u5E38\u89C1\u642D\u914D", "\u4F8B\u53E5", "\u4FDD\u5B58\u65F6\u95F4"];
      for (const h of heads) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = h;
        th.style.cssText = "position:sticky;top:0;background:#f9fafb;padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;white-space:nowrap;z-index:1;";
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      const hasDupLegend = [...wordOccurrences.values()].some((n) => n > 1);
      if (hasDupLegend) {
        const legend = document.createElement("p");
        legend.style.cssText = "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#991b1b;background:#fef2f2;padding:8px 10px;border-radius:8px;border:1px solid #fecaca;";
        legend.textContent = "\u6DE1\u7EA2\u5E95\u8272\u4E3A\u66FE\u91CD\u590D\u6536\u5F55\u7684\u5355\u8BCD\uFF0C\u5EFA\u8BAE\u91CD\u70B9\u590D\u4E60\u3002";
        scrollWrap.appendChild(legend);
      }
      const tbody = document.createElement("tbody");
      store.entries.forEach((e, i) => {
        const tr = document.createElement("tr");
        const wk = normalizeWordKey(e.\u5355\u8BCD);
        const dup = wk && (wordOccurrences.get(wk) ?? 0) > 1;
        if (dup) {
          tr.style.backgroundColor = "#fef2f2";
          tr.title = "\u8BE5\u5355\u8BCD\u66FE\u91CD\u590D\u6536\u5F55\uFF0C\u5EFA\u8BAE\u91CD\u70B9\u590D\u4E60";
        }
        const cells = [
          String(i + 1),
          e.\u5355\u8BCD,
          e.\u7FFB\u8BD1,
          e.\u89E3\u91CA,
          e.\u8BCD\u6027,
          e.\u97F3\u6807,
          e.\u5E38\u89C1\u642D\u914D,
          e.\u4F8B\u53E5,
          formatSavedAtLocal(e.savedAt)
        ];
        cells.forEach((raw, colIdx) => {
          const td = document.createElement("td");
          const multiline = colIdx >= 3 && colIdx <= 7;
          setPreviewTableCellContent(td, raw, multiline);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      scrollWrap.appendChild(table);
    }
    panel.appendChild(header);
    panel.appendChild(scrollWrap);
    backdrop.appendChild(panel);
    document.documentElement.appendChild(backdrop);
    const onKey = (ev) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
  }
  function buildMarkdownExport(store) {
    const lines = [
      "# \u8C46\u5305\u751F\u8BCD\u672C",
      "",
      `> \u5BFC\u51FA\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toISOString()}`,
      `> \u6761\u76EE\u6570\uFF1A${store.entries.length}`,
      ""
    ];
    for (const e of store.entries) {
      lines.push("---", "");
      lines.push(`## ${e.\u5355\u8BCD || "\uFF08\u65E0\u5355\u8BCD\uFF09"}`, "");
      lines.push(`- **\u4FDD\u5B58\u65F6\u95F4**\uFF1A${formatSavedAtLocal(e.savedAt)}`);
      lines.push(`- **\u9875\u9762\u6807\u9898**\uFF1A${e.pageTitle}`);
      lines.push(`- **\u9875\u9762 URL**\uFF1A${e.pageUrl}`);
      lines.push("", "| \u5B57\u6BB5 | \u5185\u5BB9 |", "| --- | --- |");
      for (const key of MD_FIELDS) {
        const val = (e[key] ?? "").trim();
        lines.push(`| ${key} | ${mdEscapeCell(val || "\u2014")} |`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  function toast(msg) {
    if (!isTopWindow()) return;
    const id = "tmjs-doubao-wordbook-toast";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText = "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);padding:10px 16px;background:#111c;color:#fff;border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.2);pointer-events:none;max-width:90vw;";
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    window.clearTimeout(toastHideTimer);
    toastHideTimer = window.setTimeout(() => {
      if (el) el.style.opacity = "0";
    }, 2200);
  }
  function updateBarCount() {
    const n = loadStore().entries.length;
    const badge = document.getElementById("tmjs-doubao-wordbook-count");
    if (badge) badge.textContent = String(n);
  }
  function syncFloatingBarCollapsedFromStorage() {
    if (!isTopWindow()) return;
    const bar = document.getElementById("tmjs-doubao-wordbook-bar");
    if (!bar) return;
    const want = readBarCollapsed();
    if (bar.dataset.collapsed === (want ? "1" : "0")) return;
    applyBarCollapsedDom(bar, want);
  }
  function ensureFloatingBar() {
    if (!isTopWindow()) return;
    if (floatingBarDismissedForPage) return;
    const existing = document.getElementById("tmjs-doubao-wordbook-bar");
    if (existing) {
      updateBarCount();
      applyBarCollapsedDom(existing, readBarCollapsed());
      return;
    }
    const bar = document.createElement("div");
    bar.id = "tmjs-doubao-wordbook-bar";
    const collapsedWrap = document.createElement("div");
    collapsedWrap.dataset.tmjsBarCollapsedWrap = "";
    collapsedWrap.style.cssText = "display:none;align-items:center;gap:4px;flex-shrink:0;";
    const fab = document.createElement("button");
    fab.type = "button";
    fab.dataset.tmjsBarFab = "";
    fab.setAttribute("aria-label", "\u5C55\u5F00\u751F\u8BCD\u672C");
    fab.title = "\u5C55\u5F00\u751F\u8BCD\u672C";
    fab.style.cssText = ICON_BTN_BASE + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
    fab.innerHTML = SVG_CHEVRON_UP;
    fab.addEventListener("click", () => {
      saveBarCollapsed(false);
      applyBarCollapsedDom(bar, false);
    });
    const closeCollapsed = document.createElement("button");
    closeCollapsed.type = "button";
    closeCollapsed.dataset.tmjsBarClose = "";
    closeCollapsed.setAttribute("aria-label", "\u5173\u95ED\u751F\u8BCD\u672C\u5DE5\u5177\u6761");
    closeCollapsed.title = "\u5173\u95ED\uFF08\u4EC5\u672C\u9875\uFF09";
    closeCollapsed.style.cssText = ICON_BTN_BASE + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
    closeCollapsed.innerHTML = SVG_CLOSE_SM;
    closeCollapsed.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissFloatingBarForPage();
    });
    collapsedWrap.appendChild(fab);
    collapsedWrap.appendChild(closeCollapsed);
    const expanded = document.createElement("div");
    expanded.dataset.tmjsBarExpanded = "";
    expanded.style.cssText = "display:none;flex-direction:column;gap:6px;width:100%;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;";
    const label = document.createElement("span");
    label.style.cssText = "color:#374151;";
    label.append("\u751F\u8BCD\u672C ");
    const countEl = document.createElement("strong");
    countEl.id = "tmjs-doubao-wordbook-count";
    countEl.textContent = "0";
    label.append(countEl, " \u6761");
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.dataset.tmjsBarCollapse = "";
    collapseBtn.setAttribute("aria-label", "\u6536\u8D77\u4E3A\u751F\u8BCD\u672C\u56FE\u6807");
    collapseBtn.title = "\u6536\u8D77";
    collapseBtn.style.cssText = ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    collapseBtn.innerHTML = SVG_CHEVRON_DOWN;
    collapseBtn.addEventListener("click", () => {
      saveBarCollapsed(true);
      applyBarCollapsedDom(bar, true);
    });
    const closeExpanded = document.createElement("button");
    closeExpanded.type = "button";
    closeExpanded.dataset.tmjsBarClose = "";
    closeExpanded.setAttribute("aria-label", "\u5173\u95ED\u751F\u8BCD\u672C\u5DE5\u5177\u6761");
    closeExpanded.title = "\u5173\u95ED\uFF08\u4EC5\u672C\u9875\uFF09";
    closeExpanded.style.cssText = ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    closeExpanded.innerHTML = SVG_CLOSE_MD;
    closeExpanded.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissFloatingBarForPage();
    });
    const headRight = document.createElement("div");
    headRight.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";
    headRight.appendChild(collapseBtn);
    headRight.appendChild(closeExpanded);
    head.appendChild(label);
    head.appendChild(headRight);
    const body = document.createElement("div");
    body.dataset.tmjsBarBody = "";
    body.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;";
    const mkBtn = (text, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText = "cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;font:inherit;";
      b.addEventListener("click", onClick);
      return b;
    };
    body.appendChild(
      mkBtn("\u67E5\u770B", () => {
        openWordbookPreviewModal();
      })
    );
    body.appendChild(
      mkBtn("\u5BFC\u51FA .json", () => {
        const store = loadStore();
        downloadBlob(
          `doubao-wordbook-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`,
          JSON.stringify(store, null, 2),
          "application/json;charset=utf-8"
        );
        toast("\u5DF2\u4E0B\u8F7D JSON");
      })
    );
    body.appendChild(
      mkBtn("\u5BFC\u51FA .md", () => {
        const store = loadStore();
        downloadBlob(
          `doubao-wordbook-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.md`,
          buildMarkdownExport(store),
          "text/markdown;charset=utf-8"
        );
        toast("\u5DF2\u4E0B\u8F7D Markdown");
      })
    );
    body.appendChild(
      mkBtn("\u5404\u5BFC\u51FA\u4E00\u6B21", () => {
        const store = loadStore();
        const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        downloadBlob(`doubao-wordbook-${date}.json`, JSON.stringify(store, null, 2), "application/json;charset=utf-8");
        setTimeout(() => {
          downloadBlob(`doubao-wordbook-${date}.md`, buildMarkdownExport(store), "text/markdown;charset=utf-8");
          toast("\u5DF2\u4E0B\u8F7D JSON \u4E0E Markdown");
        }, 400);
      })
    );
    expanded.appendChild(head);
    expanded.appendChild(body);
    bar.appendChild(collapsedWrap);
    bar.appendChild(expanded);
    document.documentElement.appendChild(bar);
    updateBarCount();
    applyBarCollapsedDom(bar, readBarCollapsed());
  }
  function saveEntryFromAnchor(anchor) {
    const done = findStreamMessageDone(anchor);
    if (!done) {
      toast("\u672A\u627E\u5230\u7FFB\u8BD1\u5185\u5BB9\uFF08stream-message-done\uFF09");
      return;
    }
    const plain = (done instanceof HTMLElement ? done.innerText : done.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!plain) {
      toast("\u7FFB\u8BD1\u5185\u5BB9\u4E3A\u7A7A");
      return;
    }
    const wordHint = extractWordFromPanel(done);
    const fields = parseDoubaoTranslation(done, wordHint);
    const store = loadStore();
    const entry = {
      id: randomId(),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageUrl: location.href,
      pageTitle: document.title,
      ...fields
    };
    store.entries.push(entry);
    saveStore(store);
    updateBarCount();
    toast(entry.\u5355\u8BCD ? `\u5DF2\u52A0\u5165\u751F\u8BCD\u672C\uFF1A${entry.\u5355\u8BCD}` : "\u5DF2\u52A0\u5165\u751F\u8BCD\u672C");
  }
  function injectAddButtons() {
    searchShadowForToolbar(document);
  }
  function ensureMutationObserverOnRoot(root) {
    if (observedMutationRoots.has(root)) return;
    observedMutationRoots.add(root);
    const mo = new MutationObserver(() => {
      queueMicrotask(() => {
        try {
          injectAddButtons();
        } catch (e) {
          console.warn("[tmjs-doubao-wordbook]", e);
        }
      });
    });
    mo.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true
    });
  }
  function searchShadowForToolbar(root) {
    ensureMutationObserverOnRoot(root);
    const copyBtns = root.querySelectorAll('[data-testid="select-output-panel-copy-operation"]');
    copyBtns.forEach((copyBtn) => {
      const actions = copyBtn.parentElement;
      if (!actions || actions.querySelector("[data-tmjs-wordbook-add]")) return;
      const buttons = actions.querySelectorAll("button");
      if (buttons.length < 1) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.tmjsWordbookAdd = "1";
      btn.textContent = "\u751F\u8BCD\u672C";
      btn.setAttribute("aria-label", "\u52A0\u5165\u751F\u8BCD\u672C");
      btn.className = copyBtn.className;
      btn.title = "\u5C06\u5F53\u524D\u7FFB\u8BD1\u7ED3\u679C\u52A0\u5165\u672C\u5730\u751F\u8BCD\u672C";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveEntryFromAnchor(copyBtn);
      });
      actions.appendChild(btn);
    });
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) searchShadowForToolbar(el.shadowRoot);
    });
  }
  function main() {
    if (isTopWindow()) {
      ensureFloatingBar();
    }
    const run = () => {
      try {
        injectAddButtons();
        syncFloatingBarCollapsedFromStorage();
      } catch (e) {
        console.warn("[tmjs-doubao-wordbook]", e);
      }
    };
    run();
    window.setInterval(run, 1500);
  }
  main();
})();
