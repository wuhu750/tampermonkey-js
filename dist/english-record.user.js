// ==UserScript==
// @name         tmjs-english-record
// @namespace    https://example.local/tmjs
// @version      0.0.1
// @description  英语记录
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

"use strict";
(() => {
  // src/userscripts/english-record.user.ts
  var FEATURES = {
    doubao: true,
    siphon: true
  };
  function gm() {
    return globalThis;
  }
  var STORAGE_KEY = "tmjs-doubao-wordbook-v1";
  var UI_COLLAPSED_KEY = "tmjs-doubao-wordbook-bar-collapsed";
  var UI_THEME_KEY = "tmjs-doubao-wordbook-bar-theme";
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
  function readBarTheme() {
    if (hasGmStorage()) {
      const v = gm().GM_getValue(UI_THEME_KEY);
      if (v === "dark" || v === "light") return v;
      return "light";
    }
    try {
      const v = localStorage.getItem(UI_THEME_KEY);
      if (v === "dark" || v === "light") return v;
    } catch {
    }
    return "light";
  }
  function saveBarTheme(theme) {
    if (hasGmStorage()) {
      gm().GM_setValue(UI_THEME_KEY, theme);
      return;
    }
    try {
      localStorage.setItem(UI_THEME_KEY, theme);
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
  var SVG_PLUS_SM = svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>', 12);
  var SVG_SUN = svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', 18);
  var SVG_MOON = svgIcon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 18);
  function applyBarThemeToBar(bar) {
    const dark = readBarTheme() === "dark";
    const c = dark ? {
      panelBg: "#111827",
      panelBorder: "#374151",
      panelShadow: "0 2px 12px rgba(0,0,0,.4)",
      label: "#e5e7eb",
      actionBg: "#1f2937",
      actionBorder: "#4b5563",
      actionFg: "#e5e7eb",
      iconBorder: "#4b5563",
      iconBg: "#1f2937",
      iconFg: "#e5e7eb",
      clearBg: "#450a0a",
      clearBorder: "#991b1b",
      clearFg: "#fecaca"
    } : {
      panelBg: "#fff",
      panelBorder: "#e5e7eb",
      panelShadow: "0 2px 12px rgba(0,0,0,.08)",
      label: "#374151",
      actionBg: "#f9fafb",
      actionBorder: "#d1d5db",
      actionFg: "#111827",
      iconBorder: "#e5e7eb",
      iconBg: "#fff",
      iconFg: "#374151",
      clearBg: "#fef2f2",
      clearBorder: "#fecaca",
      clearFg: "#991b1b"
    };
    bar.dataset.tmjsTheme = dark ? "dark" : "light";
    const collapsed = bar.dataset.collapsed === "1";
    if (collapsed) {
      bar.setAttribute(
        "style",
        BAR_POSITION_STYLE + "align-items:flex-end;padding:0;background:transparent;border:none;box-shadow:none;max-width:none;"
      );
    } else {
      bar.setAttribute(
        "style",
        BAR_POSITION_STYLE + `gap:6px;align-items:stretch;padding:8px 10px;background:${c.panelBg};border:1px solid ${c.panelBorder};border-radius:10px;font:12px/1.4 system-ui,sans-serif;box-shadow:${c.panelShadow};max-width:min(420px,92vw);`
      );
    }
    const labelEl = bar.querySelector("#tmjs-doubao-wordbook-bar-label");
    if (labelEl) labelEl.style.color = c.label;
    const icon32 = `cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid ${c.iconBorder};background:${c.iconBg};color:${c.iconFg};box-shadow:0 2px 12px rgba(0,0,0,.12);`;
    const icon22 = icon32;
    const fab = bar.querySelector("[data-tmjs-bar-fab]");
    if (fab) fab.style.cssText = icon22 + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
    bar.querySelectorAll("[data-tmjs-bar-collapsed-close]").forEach((b) => {
      b.style.cssText = icon22 + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
    });
    const collapseBtn = bar.querySelector("[data-tmjs-bar-collapse]");
    if (collapseBtn) collapseBtn.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    const closeExpanded = bar.querySelector("[data-tmjs-bar-expanded-close]");
    if (closeExpanded) closeExpanded.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    const themeBtn = bar.querySelector("[data-tmjs-bar-theme-toggle]");
    if (themeBtn) {
      themeBtn.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
      themeBtn.title = dark ? "\u5207\u6362\u4E3A\u4EAE\u8272" : "\u5207\u6362\u4E3A\u6697\u9ED1";
      themeBtn.innerHTML = dark ? SVG_SUN : SVG_MOON;
      themeBtn.setAttribute("aria-label", dark ? "\u5207\u6362\u4E3A\u4EAE\u8272" : "\u5207\u6362\u4E3A\u6697\u9ED1");
    }
    bar.querySelectorAll("[data-tmjs-bar-body] button").forEach((b) => {
      const isClear = b.dataset.tmjsBarClear === "1";
      if (isClear) {
        b.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid ${c.clearBorder};background:${c.clearBg};color:${c.clearFg};font:inherit;`;
      } else {
        b.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid ${c.actionBorder};background:${c.actionBg};color:${c.actionFg};font:inherit;`;
      }
    });
  }
  function applyBarCollapsedDom(bar, collapsed) {
    const collapsedWrap = bar.querySelector("[data-tmjs-bar-collapsed-wrap]");
    const panel = bar.querySelector("[data-tmjs-bar-expanded]");
    if (collapsedWrap) collapsedWrap.style.display = collapsed ? "inline-flex" : "none";
    if (panel) panel.style.display = collapsed ? "none" : "flex";
    bar.dataset.collapsed = collapsed ? "1" : "0";
    applyBarThemeToBar(bar);
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
        return { version: 3, entries: [] };
      }
      const entries = parsed.entries.map((e) => migrateEntryToV3(e)).sort((a, b) => {
        const ta = new Date(a.savedAt).getTime();
        const tb = new Date(b.savedAt).getTime();
        if (Number.isNaN(tb) && Number.isNaN(ta)) return 0;
        if (Number.isNaN(tb)) return -1;
        if (Number.isNaN(ta)) return 1;
        if (tb !== ta) return tb - ta;
        return b.id.localeCompare(a.id);
      });
      const result = { version: 3, entries };
      if (parsed.version !== 3 || parsed.entries.some((e) => !isV3Entry(e))) {
        saveStore(result);
      }
      return result;
    } catch {
      return { version: 3, entries: [] };
    }
  }
  function migrateEntryToV3(e) {
    if (isV3Entry(e)) return e;
    if (isV2Entry(e)) return { ...e, source: "doubao" };
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
        source: "doubao",
        ...parsed
      };
    }
    if (old.translationText) {
      return {
        id: old.id,
        savedAt: old.savedAt,
        pageUrl: old.pageUrl,
        pageTitle: old.pageTitle,
        source: "doubao",
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
      source: "doubao",
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
  function isV3Entry(e) {
    if (!isV2Entry(e)) return false;
    const o = e;
    return o["source"] === "doubao" || o["source"] === "siphon";
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
  function clearWordbookStore() {
    saveStore({ version: 3, entries: [] });
    updateBarCount();
    toast("\u5DF2\u6E05\u7A7A\u751F\u8BCD\u672C");
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
  function youdaoDictVoiceUrl(word) {
    const w = word.trim();
    if (!w) return "";
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w)}&type=2`;
  }
  function buildJsonExportPayload(store) {
    return {
      version: store.version,
      entries: store.entries.map((e) => ({
        ...e,
        \u53D1\u97F3\u94FE\u63A5: youdaoDictVoiceUrl(e.\u5355\u8BCD)
      }))
    };
  }
  function setPreviewTableCellContent(td, raw, multiline, palette) {
    const base = `padding:8px 10px;border:1px solid ${palette.cellBorder};vertical-align:top;word-break:break-word;max-width:220px;color:${palette.cellText};`;
    if (multiline) {
      const text = String(raw ?? "").replace(/\r\n/g, "\n").replace(/<br\s*\/?>/gi, "\n");
      td.textContent = text;
      td.style.cssText = base + "white-space:pre-wrap;";
    } else {
      td.textContent = raw;
      td.style.cssText = base;
    }
  }
  function buildPreviewModalUi() {
    const dark = readBarTheme() === "dark";
    if (dark) {
      return {
        dark: true,
        backdrop: "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;",
        panel: "background:#111827;border:1px solid #374151;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.55);max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;",
        header: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #374151;flex-shrink:0;",
        title: "font:600 15px/1.3 system-ui,sans-serif;color:#f9fafb;",
        clearBtn: "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #991b1b;background:#450a0a;color:#fecaca;font:13px system-ui,sans-serif;",
        closeBtn: "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;font:13px system-ui,sans-serif;",
        scrollWrap: `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;background:#111827;`,
        empty: "margin:0;color:#9ca3af;font:13px/1.5 system-ui,sans-serif;",
        table: "width:100%;min-width:820px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#e5e7eb;",
        th: "position:sticky;top:0;background:#1f2937;padding:8px 10px;border:1px solid #374151;text-align:left;font-weight:600;white-space:nowrap;z-index:1;color:#e5e7eb;",
        legend: "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#fecaca;background:#450a0a;padding:8px 10px;border-radius:8px;border:1px solid #991b1b;",
        dupRowBg: "rgba(127,29,29,.4)",
        palette: {
          cellBorder: "#374151",
          cellText: "#e5e7eb"
        },
        link: "#60a5fa",
        linkMuted: "#9ca3af"
      };
    }
    return {
      dark: false,
      backdrop: "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;",
      panel: "background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.22);max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;",
      header: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;",
      title: "font:600 15px/1.3 system-ui,sans-serif;color:#111827;",
      clearBtn: "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;font:13px system-ui,sans-serif;",
      closeBtn: "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font:13px system-ui,sans-serif;",
      scrollWrap: `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;background:#fff;`,
      empty: "margin:0;color:#6b7280;font:13px/1.5 system-ui,sans-serif;",
      table: "width:100%;min-width:820px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#111827;",
      th: "position:sticky;top:0;background:#f9fafb;padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;white-space:nowrap;z-index:1;color:#111827;",
      legend: "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#991b1b;background:#fef2f2;padding:8px 10px;border-radius:8px;border:1px solid #fecaca;",
      dupRowBg: "#fef2f2",
      palette: {
        cellBorder: "#e5e7eb",
        cellText: "#111827"
      },
      link: "#2563eb",
      linkMuted: "#6b7280"
    };
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
    const ui = buildPreviewModalUi();
    const backdrop = document.createElement("div");
    backdrop.id = PREVIEW_MODAL_ID;
    backdrop.dataset.tmjsPreviewTheme = ui.dark ? "dark" : "light";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "\u751F\u8BCD\u672C\u5185\u5BB9");
    backdrop.style.cssText = ui.backdrop;
    const stopBackdropClose = (e) => e.stopPropagation();
    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    backdrop.addEventListener("click", () => close());
    const panel = document.createElement("div");
    panel.style.cssText = ui.panel;
    panel.addEventListener("click", stopBackdropClose);
    const header = document.createElement("div");
    header.style.cssText = ui.header;
    const title = document.createElement("div");
    title.style.cssText = ui.title;
    title.textContent = `\u751F\u8BCD\u672C\u5185\u5BB9\uFF08${store.entries.length} \u6761\uFF09`;
    const headerActions = document.createElement("div");
    headerActions.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "\u6E05\u7A7A";
    clearBtn.title = "\u6E05\u7A7A\u672C\u5730\u5168\u90E8\u8BCD\u6761\uFF08\u4E0D\u53EF\u6062\u590D\uFF09";
    clearBtn.style.cssText = ui.clearBtn;
    clearBtn.addEventListener("click", () => {
      if (!confirm("\u786E\u5B9A\u6E05\u7A7A\u672C\u5730\u751F\u8BCD\u672C\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")) return;
      clearWordbookStore();
      close();
    });
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "\u5173\u95ED";
    closeBtn.style.cssText = ui.closeBtn;
    closeBtn.addEventListener("click", close);
    headerActions.appendChild(clearBtn);
    headerActions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(headerActions);
    const scrollWrap = document.createElement("div");
    scrollWrap.style.cssText = ui.scrollWrap;
    if (store.entries.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = ui.empty;
      empty.textContent = "\u6682\u65E0\u8BCD\u6761\uFF0C\u53EF\u4ECE\u8C46\u5305\u7FFB\u8BD1\u9762\u677F\u6216 Siphon \u5212\u8BCD\u52A0\u5165\u3002";
      scrollWrap.appendChild(empty);
    } else {
      const wordOccurrences = countWordOccurrences(store.entries);
      const table = document.createElement("table");
      table.style.cssText = ui.table;
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      const heads = ["#", "\u6765\u6E90", "\u5355\u8BCD", "\u53D1\u97F3", "\u7FFB\u8BD1", "\u89E3\u91CA", "\u8BCD\u6027", "\u97F3\u6807", "\u5E38\u89C1\u642D\u914D", "\u4F8B\u53E5", "\u4FDD\u5B58\u65F6\u95F4"];
      for (const h of heads) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = h;
        th.style.cssText = ui.th;
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      const hasDupLegend = [...wordOccurrences.values()].some((n) => n > 1);
      if (hasDupLegend) {
        const legend = document.createElement("p");
        legend.style.cssText = ui.legend;
        legend.textContent = "\u6DE1\u7EA2\u5E95\u8272\u4E3A\u66FE\u91CD\u590D\u6536\u5F55\u7684\u5355\u8BCD\uFF0C\u5EFA\u8BAE\u91CD\u70B9\u590D\u4E60\u3002";
        scrollWrap.appendChild(legend);
      }
      const tbody = document.createElement("tbody");
      const pal = ui.palette;
      store.entries.forEach((e, i) => {
        const tr = document.createElement("tr");
        const wk = normalizeWordKey(e.\u5355\u8BCD);
        const dup = wk && (wordOccurrences.get(wk) ?? 0) > 1;
        if (dup) {
          tr.style.backgroundColor = ui.dupRowBg;
          tr.title = "\u8BE5\u5355\u8BCD\u66FE\u91CD\u590D\u6536\u5F55\uFF0C\u5EFA\u8BAE\u91CD\u70B9\u590D\u4E60";
        }
        const sourceLabel = e.source === "siphon" ? "siphon" : "\u8C46\u5305";
        const voiceUrl = youdaoDictVoiceUrl(e.\u5355\u8BCD);
        const cells = [
          String(i + 1),
          sourceLabel,
          e.\u5355\u8BCD,
          voiceUrl,
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
          if (colIdx === 3) {
            const base = `padding:8px 10px;border:1px solid ${pal.cellBorder};vertical-align:top;word-break:break-word;max-width:280px;color:${pal.cellText};`;
            td.style.cssText = base;
            if (raw) {
              const a = document.createElement("a");
              a.href = raw;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.textContent = "\u6709\u9053\u53D1\u97F3";
              a.style.cssText = `color:${ui.link};font-weight:500;`;
              td.appendChild(a);
              const sub = document.createElement("div");
              sub.style.cssText = `font-size:11px;color:${ui.linkMuted};margin-top:4px;word-break:break-all;`;
              sub.textContent = raw;
              td.appendChild(sub);
            } else {
              td.textContent = "\u2014";
            }
            tr.appendChild(td);
            return;
          }
          const multiline = colIdx >= 5 && colIdx <= 9;
          setPreviewTableCellContent(td, raw, multiline, pal);
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
      "# \u672C\u5730\u751F\u8BCD\u672C",
      "",
      `> \u5BFC\u51FA\u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toISOString()}`,
      `> \u6761\u76EE\u6570\uFF1A${store.entries.length}`,
      ""
    ];
    for (const e of store.entries) {
      lines.push("---", "");
      lines.push(`## ${e.\u5355\u8BCD || "\uFF08\u65E0\u5355\u8BCD\uFF09"}`, "");
      lines.push(`- **\u6765\u6E90**\uFF1A${e.source === "siphon" ? "siphon" : "\u8C46\u5305"}`);
      lines.push(`- **\u4FDD\u5B58\u65F6\u95F4**\uFF1A${formatSavedAtLocal(e.savedAt)}`);
      lines.push(`- **\u9875\u9762\u6807\u9898**\uFF1A${e.pageTitle}`);
      lines.push(`- **\u9875\u9762 URL**\uFF1A${e.pageUrl}`);
      lines.push("", "| \u5B57\u6BB5 | \u5185\u5BB9 |", "| --- | --- |");
      for (const key of MD_FIELDS) {
        const val = (e[key] ?? "").trim();
        lines.push(`| ${key} | ${mdEscapeCell(val || "\u2014")} |`);
        if (key === "\u5355\u8BCD") {
          const u = youdaoDictVoiceUrl(e.\u5355\u8BCD);
          lines.push(`| \u53D1\u97F3\u94FE\u63A5 | ${mdEscapeCell(u || "\u2014")} |`);
        }
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
  function syncFloatingBarThemeFromStorage() {
    if (!isTopWindow()) return;
    const bar = document.getElementById("tmjs-doubao-wordbook-bar");
    if (!bar) return;
    const want = readBarTheme();
    if (bar.dataset.tmjsTheme === want) return;
    applyBarThemeToBar(bar);
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
    closeCollapsed.dataset.tmjsBarCollapsedClose = "1";
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
    label.id = "tmjs-doubao-wordbook-bar-label";
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
    closeExpanded.dataset.tmjsBarExpandedClose = "1";
    closeExpanded.setAttribute("aria-label", "\u5173\u95ED\u751F\u8BCD\u672C\u5DE5\u5177\u6761");
    closeExpanded.title = "\u5173\u95ED\uFF08\u4EC5\u672C\u9875\uFF09";
    closeExpanded.style.cssText = ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    closeExpanded.innerHTML = SVG_CLOSE_MD;
    closeExpanded.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissFloatingBarForPage();
    });
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.dataset.tmjsBarThemeToggle = "";
    themeBtn.setAttribute("aria-label", readBarTheme() === "dark" ? "\u5207\u6362\u4E3A\u4EAE\u8272" : "\u5207\u6362\u4E3A\u6697\u9ED1");
    themeBtn.title = readBarTheme() === "dark" ? "\u5207\u6362\u4E3A\u4EAE\u8272" : "\u5207\u6362\u4E3A\u6697\u9ED1";
    themeBtn.innerHTML = readBarTheme() === "dark" ? SVG_SUN : SVG_MOON;
    themeBtn.addEventListener("click", () => {
      const next = readBarTheme() === "dark" ? "light" : "dark";
      saveBarTheme(next);
      applyBarThemeToBar(bar);
    });
    const headRight = document.createElement("div");
    headRight.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";
    headRight.appendChild(themeBtn);
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
    const jsonExport = mkBtn("JSON", () => {
      const store = loadStore();
      downloadBlob(
        `doubao-wordbook-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`,
        JSON.stringify(buildJsonExportPayload(store), null, 2),
        "application/json;charset=utf-8"
      );
      toast("\u5DF2\u4E0B\u8F7D JSON");
    });
    jsonExport.title = "\u5BFC\u51FA .json";
    body.appendChild(jsonExport);
    const mdExport = mkBtn("MD", () => {
      const store = loadStore();
      downloadBlob(
        `doubao-wordbook-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.md`,
        buildMarkdownExport(store),
        "text/markdown;charset=utf-8"
      );
      toast("\u5DF2\u4E0B\u8F7D Markdown");
    });
    mdExport.title = "\u5BFC\u51FA .md";
    body.appendChild(mdExport);
    const clearWordbookBtn = mkBtn("\u6E05\u7A7A", () => {
      if (!confirm("\u786E\u5B9A\u6E05\u7A7A\u672C\u5730\u751F\u8BCD\u672C\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002")) return;
      clearWordbookStore();
    });
    clearWordbookBtn.dataset.tmjsBarClear = "1";
    body.appendChild(clearWordbookBtn);
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
      source: "doubao",
      ...fields
    };
    store.entries.unshift(entry);
    saveStore(store);
    updateBarCount();
    toast(entry.\u5355\u8BCD ? `\u5DF2\u52A0\u5165\u751F\u8BCD\u672C\uFF1A${entry.\u5355\u8BCD}` : "\u5DF2\u52A0\u5165\u751F\u8BCD\u672C");
  }
  var SIPHON_EXTENSION_ROOT_ID = "siphon-extension-root";
  function parseSiphonPosFromGloss(raw) {
    const \u89E3\u91CA = raw.replace(/\s+/g, " ").trim();
    if (!\u89E3\u91CA) return { \u8BCD\u6027: "", \u89E3\u91CA: "" };
    const parts = \u89E3\u91CA.split(
      /(?=\s*(?:n|v|vt|vi|adj|adv|prep|conj|pron|int|num|art|abbr|pl|aux)\.\s*)/i
    ).map((s) => s.trim()).filter(Boolean);
    const senseLines = [];
    for (const part of parts) {
      const m = part.match(/^([a-z]{1,6})\.\s*(.+)$/i);
      if (m) {
        senseLines.push(`${m[1]}. ${m[2]}`);
      }
    }
    if (senseLines.length === 0) {
      return { \u8BCD\u6027: "", \u89E3\u91CA };
    }
    return {
      \u8BCD\u6027: senseLines.join("\n"),
      \u89E3\u91CA
    };
  }
  function parseSiphonExtensionPopover(root = document) {
    const extRoot = root.querySelector(`#${SIPHON_EXTENSION_ROOT_ID}`) ?? root.querySelector(`[id="${SIPHON_EXTENSION_ROOT_ID}"]`);
    if (!extRoot) return null;
    const pop = extRoot.querySelector(".siphon-popover") ?? extRoot;
    const wordEl = pop.querySelector(".siphon-word-name");
    const word = (wordEl?.textContent ?? "").replace(/\s+/g, " ").trim();
    const body = pop.querySelector(".siphon-mt-3");
    const lines = [];
    body?.querySelectorAll("p").forEach((p) => {
      const t = (p.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (t) lines.push(t);
    });
    const rawGloss = lines.join("\n");
    if (!word && !rawGloss) return null;
    const { \u8BCD\u6027, \u89E3\u91CA } = parseSiphonPosFromGloss(rawGloss);
    return {
      \u5355\u8BCD: word || "\uFF08\u65E0\u5355\u8BCD\uFF09",
      \u7FFB\u8BD1: "",
      \u89E3\u91CA,
      \u8BCD\u6027,
      \u97F3\u6807: "",
      \u5E38\u89C1\u642D\u914D: "",
      \u4F8B\u53E5: ""
    };
  }
  function siphonEntryContentFingerprint(fields) {
    return `${normalizeWordKey(fields.\u5355\u8BCD)}|${fields.\u8BCD\u6027.trim().slice(0, 200)}|${fields.\u89E3\u91CA.trim().slice(0, 500)}`;
  }
  function saveSiphonEntryCore(fields, toastMsg, silentOnDup) {
    const store = loadStore();
    const entry = {
      id: randomId(),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageUrl: location.href,
      pageTitle: document.title,
      source: "siphon",
      ...fields
    };
    const fp = siphonEntryContentFingerprint(entry);
    if (store.entries.some((e) => e.source === "siphon" && siphonEntryContentFingerprint(e) === fp)) {
      if (!silentOnDup) toast("\u8BE5 Siphon \u5185\u5BB9\u5DF2\u5728\u751F\u8BCD\u672C\u4E2D");
      return;
    }
    store.entries.unshift(entry);
    saveStore(store);
    updateBarCount();
    if (toastMsg) toast(toastMsg);
  }
  function saveEntryFromSiphonSelection(word) {
    const w = word.trim();
    if (!w) return;
    const parsed = parseSiphonExtensionPopover(document);
    let fields;
    if (parsed && normalizeWordKey(parsed.\u5355\u8BCD) === normalizeWordKey(w)) {
      fields = { ...parsed, \u5355\u8BCD: w };
    } else if (parsed?.\u89E3\u91CA) {
      fields = {
        \u5355\u8BCD: w,
        \u7FFB\u8BD1: "",
        \u89E3\u91CA: parsed.\u89E3\u91CA,
        \u8BCD\u6027: parsed.\u8BCD\u6027,
        \u97F3\u6807: "",
        \u5E38\u89C1\u642D\u914D: "",
        \u4F8B\u53E5: ""
      };
    } else {
      fields = {
        \u5355\u8BCD: w,
        \u7FFB\u8BD1: "",
        \u89E3\u91CA: "",
        \u8BCD\u6027: "",
        \u97F3\u6807: "",
        \u5E38\u89C1\u642D\u914D: "",
        \u4F8B\u53E5: ""
      };
    }
    saveSiphonEntryCore(fields, `\u5DF2\u52A0\u5165\u751F\u8BCD\u672C\uFF08siphon\uFF09\uFF1A${fields.\u5355\u8BCD}`);
  }
  var siphonPopoverObserveTimer = 0;
  function tryAutoCaptureSiphonPopover() {
    const parsed = parseSiphonExtensionPopover(document);
    if (!parsed || !parsed.\u89E3\u91CA.trim()) return;
    saveSiphonEntryCore(parsed, `\u5DF2\u4ECE Siphon \u540C\u6B65\uFF1A${parsed.\u5355\u8BCD}`, true);
  }
  function initSiphonExtensionRootObserver() {
    const mo = new MutationObserver(() => {
      window.clearTimeout(siphonPopoverObserveTimer);
      siphonPopoverObserveTimer = window.setTimeout(() => {
        try {
          tryAutoCaptureSiphonPopover();
        } catch (e) {
          console.warn("[tmjs-doubao-wordbook] siphon popover capture", e);
        }
      }, 450);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
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
  var SIPHON_SELECTION_TOOLBAR_ID = "tmjs-selection-siphon-toolbar";
  function siphonLog(msg, extra) {
    if (extra !== void 0) {
      console.log("[tmjs-siphon]", msg, extra);
    } else {
      console.log("[tmjs-siphon]", msg);
    }
  }
  var siphonPendingRange = null;
  var siphonToolbarShownAt = 0;
  var SIPHON_TOOLBAR_HIDE_GUARD_MS = 800;
  function inSiphonToolbarGuardWindow() {
    return Date.now() - siphonToolbarShownAt < SIPHON_TOOLBAR_HIDE_GUARD_MS;
  }
  function isEditableForSiphon(el) {
    if (!el) return false;
    const t = el.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
    const h = el;
    if (h.isContentEditable) return true;
    return !!el.closest("[contenteditable='true'], [contenteditable='']");
  }
  function hideSiphonSelectionToolbar() {
    document.getElementById(SIPHON_SELECTION_TOOLBAR_ID)?.remove();
  }
  function findDoubaoNativeRootContainer() {
    const hosts = Array.from(document.querySelectorAll("doubao-ai-csui"));
    siphonLog("findDoubaoNativeRootContainer: \u626B\u63CF\u5BBF\u4E3B", { hostCount: hosts.length });
    for (const host of hosts) {
      const root = host;
      if (Array.from(root.classList).some((c) => c.startsWith("rootContainer-"))) {
        siphonLog("findDoubaoNativeRootContainer: \u547D\u4E2D\u5BBF\u4E3B\u81EA\u8EAB class \u524D\u7F00", {
          className: root.className
        });
        return root;
      }
      const inner = root.querySelector('[class^="rootContainer-"]');
      if (inner) {
        siphonLog("findDoubaoNativeRootContainer: \u547D\u4E2D\u5BBF\u4E3B\u5185\u90E8 class \u524D\u7F00", {
          className: inner.className
        });
        return inner;
      }
      const lightAny = Array.from(root.querySelectorAll("*")).find(
        (el) => Array.from(el.classList).some((c) => c.startsWith("rootContainer-"))
      );
      if (lightAny) {
        siphonLog("findDoubaoNativeRootContainer: \u547D\u4E2D light DOM class token \u524D\u7F00", {
          className: lightAny.className
        });
        return lightAny;
      }
      const sr = root.shadowRoot;
      if (sr) {
        const shadowByPrefix = sr.querySelector('[class^="rootContainer-"]');
        if (shadowByPrefix) {
          siphonLog("findDoubaoNativeRootContainer: \u547D\u4E2D shadowRoot class \u524D\u7F00", {
            className: shadowByPrefix.className
          });
          return shadowByPrefix;
        }
        const shadowAny = Array.from(sr.querySelectorAll("*")).find(
          (el) => Array.from(el.classList).some((c) => c.startsWith("rootContainer-"))
        );
        if (shadowAny) {
          siphonLog("findDoubaoNativeRootContainer: \u547D\u4E2D shadowRoot class token \u524D\u7F00", {
            className: shadowAny.className
          });
          return shadowAny;
        }
        siphonLog("findDoubaoNativeRootContainer: \u5BBF\u4E3B\u5B58\u5728 shadowRoot\uFF0C\u4F46\u672A\u547D\u4E2D rootContainer-*");
      }
    }
    siphonLog("findDoubaoNativeRootContainer: \u672A\u627E\u5230 rootContainer-*");
    return null;
  }
  function attachSiphonToolbarIntoDoubao(bar) {
    const nativeDoubao = findDoubaoNativeRootContainer();
    if (!nativeDoubao) {
      siphonLog("attachSiphonToolbarIntoDoubao: \u672A\u627E\u5230\u8C46\u5305\u5BB9\u5668");
      return false;
    }
    const cs = window.getComputedStyle(nativeDoubao);
    if (cs.position === "static") {
      siphonLog("attachSiphonToolbarIntoDoubao: \u5BB9\u5668\u4E3A static\uFF0C\u6539\u4E3A relative");
      nativeDoubao.style.position = "relative";
    }
    bar.style.cssText = "position:absolute;right:-56px;top:50%;transform:translateY(-50%);display:flex;align-items:center;pointer-events:auto;z-index:2147483647;";
    nativeDoubao.appendChild(bar);
    siphonLog("attachSiphonToolbarIntoDoubao: \u5DF2\u6302\u8F7D\u5230\u8C46\u5305\u5BB9\u5668", {
      className: nativeDoubao.className,
      tagName: nativeDoubao.tagName
    });
    return true;
  }
  function getPageWindowForEvents() {
    const g = globalThis;
    return g.unsafeWindow ?? window;
  }
  function applyRangeToPageSelection(range, tag) {
    const pw = getPageWindowForEvents();
    const sel = pw.getSelection();
    if (!sel) {
      siphonLog(`applyRangeToPageSelection(${tag}): page getSelection() \u4E3A null`);
      return;
    }
    try {
      sel.removeAllRanges();
      sel.addRange(range);
      const pageText = sel.toString();
      let sandboxText = "";
      try {
        sandboxText = window.getSelection()?.toString() ?? "";
      } catch {
        sandboxText = "(read sandbox selection failed)";
      }
      siphonLog(`applyRangeToPageSelection(${tag})`, {
        pageSelectionLength: pageText.length,
        pagePreview: pageText.slice(0, 120),
        sandboxSelectionLength: sandboxText.length,
        rangeCollapsed: range.collapsed
      });
    } catch (err) {
      siphonLog(`applyRangeToPageSelection(${tag}) \u629B\u9519`, err);
      throw err;
    }
  }
  function scheduleReselectRange(range) {
    const run = (label) => {
      try {
        applyRangeToPageSelection(range.cloneRange(), `reapply:${label}`);
      } catch (err) {
        siphonLog(`scheduleReselectRange(${label}) \u5931\u8D25`, err);
      }
    };
    siphonLog("scheduleReselectRange \u5F00\u59CB\uFF0C\u5C06\u591A\u6B21\u5199\u56DE\u9009\u533A");
    requestAnimationFrame(() => run("rAF"));
    setTimeout(() => run("0ms"), 0);
    setTimeout(() => run("32ms"), 32);
    setTimeout(() => run("100ms"), 100);
    setTimeout(() => run("200ms"), 200);
    setTimeout(() => run("400ms"), 400);
  }
  function dispatchContextMenuAtSelectionRange(range) {
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      siphonLog("dispatchContextMenuAtSelectionRange: \u9009\u533A rect \u5BBD\u9AD8\u4E3A 0\uFF0C\u4E2D\u6B62", { rect });
      return;
    }
    const pw = getPageWindowForEvents();
    const x = Math.min(pw.innerWidth - 1, Math.max(0, Math.round(rect.left + rect.width / 2)));
    const y = Math.min(pw.innerHeight - 1, Math.max(0, Math.round(rect.top + rect.height / 2)));
    const doc = pw.document;
    const target = doc.elementFromPoint(x, y) ?? doc.body;
    const MouseEv = pw.MouseEvent;
    const PointerEv = pw.PointerEvent;
    const base = {
      bubbles: true,
      cancelable: true,
      view: pw,
      clientX: x,
      clientY: y,
      screenX: x + pw.screenX,
      screenY: y + pw.screenY,
      button: 2,
      buttons: 2
    };
    siphonLog("dispatchContextMenuAtSelectionRange", {
      x,
      y,
      rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
      targetTag: target.tagName,
      targetId: target.id || "(\u65E0)",
      targetClass: typeof target.className === "string" ? String(target.className).slice(0, 80) : ""
    });
    try {
      target?.focus?.({ preventScroll: true });
    } catch {
    }
    const dispatchAndLog = (type, ev) => {
      const ok = target.dispatchEvent(ev);
      siphonLog("dispatchEvent", {
        type,
        ok,
        isTrusted: ev.isTrusted ?? "(unknown)"
      });
      return ok;
    };
    if (PointerEv) {
      dispatchAndLog("pointerdown", new PointerEv("pointerdown", { ...base, pointerType: "mouse", isPrimary: true }));
      dispatchAndLog("pointerup", new PointerEv("pointerup", { ...base, pointerType: "mouse", isPrimary: true }));
    }
    dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 3 }));
    dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 3 }));
    dispatchAndLog("contextmenu", new MouseEv("contextmenu", { ...base, which: 3 }));
  }
  function dispatchAltDblClickAtSelectionRange(range) {
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      siphonLog("dispatchAltDblClickAtSelectionRange: \u9009\u533A rect \u5BBD\u9AD8\u4E3A 0\uFF0C\u4E2D\u6B62", { rect });
      return;
    }
    const pw = getPageWindowForEvents();
    const x = Math.min(pw.innerWidth - 1, Math.max(0, Math.round(rect.left + rect.width / 2)));
    const y = Math.min(pw.innerHeight - 1, Math.max(0, Math.round(rect.top + rect.height / 2)));
    const doc = pw.document;
    const target = doc.elementFromPoint(x, y) ?? doc.body;
    const MouseEv = pw.MouseEvent;
    const PointerEv = pw.PointerEvent;
    const base = {
      bubbles: true,
      cancelable: true,
      view: pw,
      clientX: x,
      clientY: y,
      screenX: x + pw.screenX,
      screenY: y + pw.screenY,
      button: 0,
      buttons: 1,
      detail: 2,
      altKey: true
    };
    siphonLog("dispatchAltDblClickAtSelectionRange", {
      x,
      y,
      rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
      targetTag: target.tagName,
      targetId: target.id || "(\u65E0)"
    });
    try {
      target?.focus?.({ preventScroll: true });
    } catch {
    }
    const dispatchAndLog = (type, ev) => {
      const ok = target.dispatchEvent(ev);
      siphonLog("dispatchEvent", {
        type,
        ok,
        isTrusted: ev.isTrusted ?? "(unknown)",
        altKey: ev.altKey ?? "(unknown)",
        detail: ev.detail ?? "(unknown)"
      });
      return ok;
    };
    if (PointerEv) {
      dispatchAndLog("pointerdown", new PointerEv("pointerdown", { ...base, pointerType: "mouse", isPrimary: true }));
      dispatchAndLog("pointerup", new PointerEv("pointerup", { ...base, pointerType: "mouse", isPrimary: true }));
    }
    dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 1, detail: 1 }));
    dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 1, detail: 1 }));
    dispatchAndLog("click", new MouseEv("click", { ...base, which: 1, detail: 1 }));
    dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 1, detail: 2 }));
    dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 1, detail: 2 }));
    dispatchAndLog("click", new MouseEv("click", { ...base, which: 1, detail: 2 }));
    dispatchAndLog("dblclick", new MouseEv("dblclick", { ...base, which: 1, detail: 2 }));
  }
  function showSiphonSelectionToolbar(rect) {
    hideSiphonSelectionToolbar();
    siphonToolbarShownAt = Date.now();
    siphonLog("showSiphonSelectionToolbar: \u5F00\u59CB\u6E32\u67D3", {
      rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top }
    });
    const bar = document.createElement("div");
    bar.id = SIPHON_SELECTION_TOOLBAR_ID;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "\u7FFB\u8BD1\u5E76\u52A0\u5165\u751F\u8BCD\u672C");
    btn.title = "\u4F18\u5148\u5C1D\u8BD5\u89E6\u53D1 Siphon \u5FEB\u6377\u952E\uFF1AAlt(Option)+\u53CC\u51FB\u9009\u8BCD\uFF1B\u4E0D\u884C\u518D\u6A21\u62DF\u53F3\u952E\uFF08\u6269\u5C55\u662F\u5426\u54CD\u5E94\u5408\u6210\u4E8B\u4EF6\u56E0\u73AF\u5883\u800C\u5F02\uFF09";
    btn.style.cssText = "cursor:pointer;width:24px;height:24px;padding:0;border-radius:6px;border:none;background:#6366f1;color:#fff;display:inline-flex;align-items:center;justify-content:center;";
    btn.innerHTML = SVG_PLUS_SM;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      siphonLog("\u6309\u94AE\u70B9\u51FB: \u5F00\u59CB");
      if (!siphonPendingRange) {
        siphonLog("\u6309\u94AE\u70B9\u51FB: siphonPendingRange \u4E3A\u7A7A\uFF0C\u9000\u51FA");
        return;
      }
      const saved = siphonPendingRange.cloneRange();
      const text = saved.toString().trim();
      siphonLog("\u6309\u94AE\u70B9\u51FB: \u5DF2\u514B\u9686 Range", {
        textLength: text.length,
        textPreview: text.slice(0, 160)
      });
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
      if (text) {
        saveEntryFromSiphonSelection(text);
      }
      try {
        applyRangeToPageSelection(saved, "button-click");
        dispatchAltDblClickAtSelectionRange(saved);
        dispatchContextMenuAtSelectionRange(saved);
        scheduleReselectRange(saved);
        if (text && typeof navigator.clipboard?.writeText === "function") {
          void navigator.clipboard.writeText(text).then(
            () => siphonLog("clipboard.writeText \u6210\u529F", { len: text.length }),
            (err) => siphonLog("clipboard.writeText \u5931\u8D25", err)
          );
        } else {
          siphonLog("\u8DF3\u8FC7\u526A\u8D34\u677F", {
            hasText: !!text,
            hasClipboard: typeof navigator.clipboard?.writeText === "function"
          });
        }
        siphonLog("\u6309\u94AE\u70B9\u51FB: \u6D41\u7A0B\u7ED3\u675F\uFF08\u5F02\u6B65 reapply \u4ECD\u4F1A\u6253\u65E5\u5FD7\uFF09");
      } catch (err) {
        console.warn("[tmjs-doubao-wordbook] siphon toolbar", err);
        siphonLog("\u6309\u94AE\u70B9\u51FB: catch", err);
      }
    });
    bar.appendChild(btn);
    const mountFallbackNearSelection = () => {
      bar.style.cssText = "position:fixed;z-index:2147483645;display:flex;align-items:center;gap:4px;padding:4px 6px;background:#1f2937;color:#f9fafb;border-radius:7px;font:12px/1.25 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.22);pointer-events:auto;max-width:min(90vw,320px);";
      const pad = 6;
      let left = rect.left + rect.width / 2;
      let top = rect.bottom + pad;
      bar.style.left = "0";
      bar.style.top = "0";
      bar.style.visibility = "hidden";
      document.documentElement.appendChild(bar);
      const bw = bar.offsetWidth;
      const bh = bar.offsetHeight;
      const fallbackBar = document.getElementById("tmjs-doubao-wordbook-bar");
      if (fallbackBar) {
        const r = fallbackBar.getBoundingClientRect();
        left = r.right + 2;
        top = r.top + (r.height - bh) / 2;
      } else {
        left = left - bw / 2;
        if (top + bh > window.innerHeight - pad) {
          top = rect.top - bh - pad;
        }
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - bw - pad));
      top = Math.max(pad, top);
      bar.style.visibility = "visible";
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
      siphonLog("showSiphonSelectionToolbar: fallback \u5DF2\u6E32\u67D3\u53EF\u89C1", { left, top });
    };
    mountFallbackNearSelection();
    const MAX_TRIES = 12;
    const RETRY_MS = 120;
    let tries = 0;
    const tryMount = () => {
      if (!bar.isConnected) {
        siphonLog("showSiphonSelectionToolbar: \u5DE5\u5177\u6761\u5DF2\u4E0D\u5B58\u5728\uFF0C\u505C\u6B62\u91CD\u8BD5");
        return;
      }
      siphonLog("showSiphonSelectionToolbar: \u5C1D\u8BD5\u6302\u8F7D\u5230\u8C46\u5305\u5BB9\u5668", {
        tryIndex: tries + 1,
        maxTries: MAX_TRIES
      });
      try {
        if (attachSiphonToolbarIntoDoubao(bar)) return;
      } catch (err) {
        siphonLog("showSiphonSelectionToolbar: tryMount \u5F02\u5E38", err);
      }
      tries += 1;
      if (tries >= MAX_TRIES) {
        siphonLog("showSiphonSelectionToolbar: \u8FBE\u5230\u91CD\u8BD5\u4E0A\u9650\uFF0C\u8D70 fallback \u5B9A\u4F4D");
        return;
      }
      window.setTimeout(tryMount, RETRY_MS);
    };
    tryMount();
  }
  function handleSiphonSelectionMouseUp() {
    if (!isTopWindow()) return;
    window.setTimeout(() => {
      const sel = window.getSelection();
      const pw = getPageWindowForEvents();
      const pageSel = pw.getSelection();
      siphonLog("handleSiphonSelectionMouseUp: \u9009\u533A\u5FEB\u7167", {
        sandboxCollapsed: sel?.isCollapsed ?? "(null)",
        sandboxLen: sel?.toString().length ?? 0,
        pageCollapsed: pageSel?.isCollapsed ?? "(null)",
        pageLen: pageSel?.toString().length ?? 0
      });
      if (!sel || sel.isCollapsed) {
        if (inSiphonToolbarGuardWindow()) {
          siphonLog("handleSiphonSelectionMouseUp: \u5904\u4E8E\u4FDD\u62A4\u7A97\u53E3\uFF0C\u5FFD\u7565\u6298\u53E0\u9009\u533A\u9690\u85CF");
          return;
        }
        siphonLog("handleSiphonSelectionMouseUp: \u65E0\u9009\u533A\u6216\u6298\u53E0\uFF0C\u4E0D\u663E\u793A\u6761");
        hideSiphonSelectionToolbar();
        siphonPendingRange = null;
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        if (inSiphonToolbarGuardWindow()) {
          siphonLog("handleSiphonSelectionMouseUp: \u5904\u4E8E\u4FDD\u62A4\u7A97\u53E3\uFF0C\u5FFD\u7565\u7A7A\u6587\u672C\u9690\u85CF");
          return;
        }
        siphonLog("handleSiphonSelectionMouseUp: \u6587\u672C\u4E3A\u7A7A");
        hideSiphonSelectionToolbar();
        siphonPendingRange = null;
        return;
      }
      const node = sel.anchorNode;
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (isEditableForSiphon(el)) {
        siphonLog("handleSiphonSelectionMouseUp: \u5728\u53EF\u7F16\u8F91\u533A\u57DF\uFF0C\u8DF3\u8FC7", { tag: el?.tagName });
        hideSiphonSelectionToolbar();
        siphonPendingRange = null;
        return;
      }
      let range;
      try {
        range = sel.getRangeAt(0).cloneRange();
      } catch (err) {
        siphonLog("handleSiphonSelectionMouseUp: getRangeAt \u5931\u8D25", err);
        return;
      }
      siphonPendingRange = range.cloneRange();
      const rect = range.getBoundingClientRect();
      siphonLog("handleSiphonSelectionMouseUp: \u663E\u793A\u60AC\u6D6E\u6761", {
        preview: text.slice(0, 100),
        rect: { w: rect.width, h: rect.height }
      });
      showSiphonSelectionToolbar(rect);
    }, 10);
  }
  function initSelectionSiphonToolbar() {
    if (!isTopWindow()) return;
    const g = globalThis;
    siphonLog("initSelectionSiphonToolbar", {
      hasUnsafeWindow: !!g.unsafeWindow,
      userAgent: navigator.userAgent?.slice(0, 120)
    });
    document.addEventListener(
      "mouseup",
      (e) => {
        if (e.button !== 0) return;
        const t = e.target;
        if (t instanceof Element && document.getElementById(SIPHON_SELECTION_TOOLBAR_ID)?.contains(t)) {
          return;
        }
        handleSiphonSelectionMouseUp();
      },
      true
    );
    document.addEventListener("mousedown", (e) => {
      const bar = document.getElementById(SIPHON_SELECTION_TOOLBAR_ID);
      if (!bar) return;
      if (inSiphonToolbarGuardWindow()) {
        siphonLog("mousedown: \u5904\u4E8E\u4FDD\u62A4\u7A97\u53E3\uFF0C\u5FFD\u7565\u81EA\u52A8\u9690\u85CF");
        return;
      }
      if (e.target instanceof Node && bar.contains(e.target)) return;
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
    });
    document.addEventListener("scroll", () => hideSiphonSelectionToolbar(), true);
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (inSiphonToolbarGuardWindow()) {
        siphonLog("selectionchange: \u5904\u4E8E\u4FDD\u62A4\u7A97\u53E3\uFF0C\u5FFD\u7565\u81EA\u52A8\u9690\u85CF");
        return;
      }
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideSiphonSelectionToolbar();
        siphonPendingRange = null;
      }
    });
  }
  function main() {
    const plugins = [
      {
        id: "doubao",
        enabled: FEATURES.doubao,
        init: () => {
          if (!isTopWindow()) return;
          ensureFloatingBar();
          const run = () => {
            try {
              injectAddButtons();
              syncFloatingBarCollapsedFromStorage();
              syncFloatingBarThemeFromStorage();
            } catch (e) {
              console.warn("[tmjs-doubao-wordbook]", e);
            }
          };
          run();
          window.setInterval(run, 1500);
        }
      },
      {
        id: "siphon",
        enabled: FEATURES.siphon,
        init: () => {
          if (!isTopWindow()) return;
          initSiphonExtensionRootObserver();
          initSelectionSiphonToolbar();
        }
      }
    ];
    for (const p of plugins) {
      if (!p.enabled) continue;
      try {
        p.init();
      } catch (e) {
        console.warn(`[tmjs-doubao-wordbook] plugin init failed: ${p.id}`, e);
      }
    }
  }
  main();
})();
