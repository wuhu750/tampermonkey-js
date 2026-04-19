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

export {};

/**
 * 功能开关（类似插件）
 * - doubao: 豆包翻译面板注入「生词本」按钮 + 右下角工具条/导出/查看
 * - siphon: 划词悬浮条（加入本地 + 尝试触发扩展快捷键/右键）
 */
const FEATURES = {
  doubao: true,
  siphon: true,
} as const;

type GmGlobal = typeof globalThis & {
  GM_getValue?: (name: string, defaultValue?: unknown) => unknown;
  GM_setValue?: (name: string, value: unknown) => void;
};

function gm(): GmGlobal {
  return globalThis as GmGlobal;
}

/** 与豆包翻译面板结构对齐：按词性、音标、常见搭配、例句、单词、翻译、解释 存储 */
interface DoubaoWordbookEntry {
  id: string;
  savedAt: string;
  pageUrl: string;
  pageTitle: string;
  source: "doubao" | "siphon";
  单词: string;
  翻译: string;
  解释: string;
  词性: string;
  音标: string;
  常见搭配: string;
  例句: string;
  /** 单词所在元素的 XPath（用于后续跳转到原文位置） */
  wordXPath?: string;
  /** 单词在 textNode 中的字符偏移（与 wordXPath 配合使用） */
  wordTextOffset?: number;
}

/** v1 旧格式（导入迁移用） */
interface DoubaoWordbookEntryV1 {
  id: string;
  savedAt: string;
  pageUrl: string;
  pageTitle: string;
  word?: string;
  translationHtml?: string;
  translationText?: string;
}

interface WordbookStore {
  version: 3;
  entries: DoubaoWordbookEntry[];
}

const STORAGE_KEY = "tmjs-doubao-wordbook-v1";
/** 工具条折叠状态，与站点无关，全浏览器共享 */
const UI_COLLAPSED_KEY = "tmjs-doubao-wordbook-bar-collapsed";
/** 浮层主题：亮色 / 暗黑 */
const UI_THEME_KEY = "tmjs-doubao-wordbook-bar-theme";

function hasGmStorage(): boolean {
  const g = gm();
  return typeof g.GM_getValue === "function" && typeof g.GM_setValue === "function";
}

/**
 * 从 GM / localStorage 读出原始数据。
 * 注意：Tampermonkey 对 JSON 字符串常会在 get 时自动反序列化成 object，若只判断 string 会误判为空并退回按域 localStorage。
 */
function readRawStore(): unknown | null {
  if (hasGmStorage()) {
    const g = gm();
    const v = g.GM_getValue!(STORAGE_KEY);
    if (v != null && v !== "") {
      return v;
    }
    try {
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        g.GM_setValue!(STORAGE_KEY, parsed);
        localStorage.removeItem(STORAGE_KEY);
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    const ls = localStorage.getItem(STORAGE_KEY);
    if (!ls) return null;
    return JSON.parse(ls) as unknown;
  } catch {
    return null;
  }
}

function normalizeStorePayload(raw: unknown): { version?: number; entries?: unknown[] } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as { version?: number; entries?: unknown[] };
  }
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (typeof o === "object" && o !== null && !Array.isArray(o)) {
        return o as { version?: number; entries?: unknown[] };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function readBarCollapsed(): boolean {
  if (hasGmStorage()) {
    const v = gm().GM_getValue!(UI_COLLAPSED_KEY);
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

function saveBarCollapsed(collapsed: boolean) {
  if (hasGmStorage()) {
    gm().GM_setValue!(UI_COLLAPSED_KEY, collapsed);
    return;
  }
  try {
    localStorage.setItem(UI_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readBarTheme(): "light" | "dark" {
  if (hasGmStorage()) {
    const v = gm().GM_getValue!(UI_THEME_KEY);
    if (v === "dark" || v === "light") return v;
    return "light";
  }
  try {
    const v = localStorage.getItem(UI_THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function saveBarTheme(theme: "light" | "dark") {
  if (hasGmStorage()) {
    gm().GM_setValue!(UI_THEME_KEY, theme);
    return;
  }
  try {
    localStorage.setItem(UI_THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** 与 ensureFloatingBar 中 bar 定位一致 */
const BAR_POSITION_STYLE =
  "position:fixed;z-index:2147483646;right:12px;bottom:12px;display:flex;flex-direction:column;";

const ICON_BTN_BASE =
  "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;" +
  "border:1px solid #e5e7eb;background:#fff;color:#374151;box-shadow:0 2px 12px rgba(0,0,0,.12);";

function svgIcon(paths: string, sizePx = 20): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** 展开：向上 chevron（折叠态 FAB，尺寸为原 20px 的 50%） */
const SVG_CHEVRON_UP = svgIcon('<path d="m18 15-6-6-6 6"/>', 10);
/** 收起：向下 chevron（展开态标题栏按钮） */
const SVG_CHEVRON_DOWN = svgIcon('<path d="m6 9 6 6 6-6"/>');
/** 关闭（本页移除工具条） */
const SVG_CLOSE_SM = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 10);
const SVG_CLOSE_MD = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 14);
/** 划词悬浮条：仅图标按钮（加号） */
const SVG_PLUS_SM = svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>', 12);
/** 主题切换：太阳（切到亮色） / 月亮（切到暗黑） */
const SVG_SUN = svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', 18);
const SVG_MOON = svgIcon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 18);

function applyBarThemeToBar(bar: HTMLElement) {
  const dark = readBarTheme() === "dark";
  const c = dark
    ? {
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
        clearFg: "#fecaca",
      }
    : {
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
        clearFg: "#991b1b",
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
      BAR_POSITION_STYLE +
        `gap:6px;align-items:stretch;padding:8px 10px;background:${c.panelBg};border:1px solid ${c.panelBorder};border-radius:10px;` +
        `font:12px/1.4 system-ui,sans-serif;box-shadow:${c.panelShadow};max-width:min(420px,92vw);`
    );
  }

  const labelEl = bar.querySelector("#tmjs-doubao-wordbook-bar-label") as HTMLElement | null;
  if (labelEl) labelEl.style.color = c.label;

  const icon32 =
    "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;" +
    `border:1px solid ${c.iconBorder};background:${c.iconBg};color:${c.iconFg};box-shadow:0 2px 12px rgba(0,0,0,.12);`;
  const icon22 = icon32;

  const fab = bar.querySelector<HTMLButtonElement>("[data-tmjs-bar-fab]");
  if (fab) fab.style.cssText = icon22 + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
  bar.querySelectorAll<HTMLButtonElement>("[data-tmjs-bar-collapsed-close]").forEach((b) => {
    b.style.cssText = icon22 + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
  });
  const collapseBtn = bar.querySelector<HTMLButtonElement>("[data-tmjs-bar-collapse]");
  if (collapseBtn) collapseBtn.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
  const closeExpanded = bar.querySelector<HTMLButtonElement>("[data-tmjs-bar-expanded-close]");
  if (closeExpanded) closeExpanded.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";

  const themeBtn = bar.querySelector<HTMLButtonElement>("[data-tmjs-bar-theme-toggle]");
  if (themeBtn) {
    themeBtn.style.cssText = icon32 + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
    themeBtn.title = dark ? "切换为亮色" : "切换为暗黑";
    themeBtn.innerHTML = dark ? SVG_SUN : SVG_MOON;
    themeBtn.setAttribute("aria-label", dark ? "切换为亮色" : "切换为暗黑");
  }

  bar.querySelectorAll<HTMLButtonElement>("[data-tmjs-bar-body] button").forEach((b) => {
    const isClear = b.dataset.tmjsBarClear === "1";
    if (isClear) {
      b.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid ${c.clearBorder};background:${c.clearBg};color:${c.clearFg};font:inherit;`;
    } else {
      b.style.cssText = `cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid ${c.actionBorder};background:${c.actionBg};color:${c.actionFg};font:inherit;`;
    }
  });
}

function applyBarCollapsedDom(bar: HTMLElement, collapsed: boolean) {
  const collapsedWrap = bar.querySelector("[data-tmjs-bar-collapsed-wrap]") as HTMLElement | null;
  const panel = bar.querySelector("[data-tmjs-bar-expanded]") as HTMLElement | null;
  if (collapsedWrap) collapsedWrap.style.display = collapsed ? "inline-flex" : "none";
  if (panel) panel.style.display = collapsed ? "none" : "flex";

  bar.dataset.collapsed = collapsed ? "1" : "0";
  applyBarThemeToBar(bar);
}

/** 仅在顶层窗口展示页面弹窗（右下角工具条、toast）；在 iframe 内注入不展示，避免嵌套页面重复出现 */
function isTopWindow(): boolean {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

let toastHideTimer = 0;

/** 用户在本页点「关闭」后移除工具条；不写入 GM，刷新页面后会再显示 */
let floatingBarDismissedForPage = false;

function dismissFloatingBarForPage() {
  floatingBarDismissedForPage = true;
  document.getElementById("tmjs-doubao-wordbook-bar")?.remove();
}

/** 已对哪些 Document/ShadowRoot 挂了 MutationObserver（Shadow 内变化不会冒泡到 document） */
const observedMutationRoots = new WeakSet<Document | ShadowRoot>();

function loadStore(): WordbookStore {
  try {
    const raw = readRawStore();
    const parsed = normalizeStorePayload(raw);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { version: 3, entries: [] };
    }
    const entries = parsed.entries
      .map((e) => migrateEntryToV3(e))
      .sort((a, b) => {
        const ta = new Date(a.savedAt).getTime();
        const tb = new Date(b.savedAt).getTime();
        if (Number.isNaN(tb) && Number.isNaN(ta)) return 0;
        if (Number.isNaN(tb)) return -1;
        if (Number.isNaN(ta)) return 1;
        if (tb !== ta) return tb - ta;
        return b.id.localeCompare(a.id);
      });
    const result: WordbookStore = { version: 3, entries };
    if (parsed.version !== 3 || parsed.entries.some((e) => !isV3Entry(e))) {
      saveStore(result);
    }
    return result;
  } catch {
    return { version: 3, entries: [] };
  }
}

function migrateEntryToV3(e: unknown): DoubaoWordbookEntry {
  if (isV3Entry(e)) return e;
  if (isV2Entry(e)) return { ...(e as unknown as Omit<DoubaoWordbookEntry, "source">), source: "doubao" };
  const old = e as DoubaoWordbookEntryV1;
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
      ...parsed,
    };
  }
  if (old.translationText) {
    return {
      id: old.id,
      savedAt: old.savedAt,
      pageUrl: old.pageUrl,
      pageTitle: old.pageTitle,
      source: "doubao",
      单词: hint,
      翻译: "",
      解释: old.translationText,
      词性: "",
      音标: "",
      常见搭配: "",
      例句: "",
    };
  }
  return {
    id: old.id ?? randomId(),
    savedAt: old.savedAt ?? new Date().toISOString(),
    pageUrl: old.pageUrl ?? "",
    pageTitle: old.pageTitle ?? "",
    source: "doubao",
    单词: hint,
    翻译: "",
    解释: "",
    词性: "",
    音标: "",
    常见搭配: "",
    例句: "",
  };
}

function isV2Entry(e: unknown): e is Omit<DoubaoWordbookEntry, "source"> & { source?: unknown } {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o["单词"] === "string" &&
    typeof o["翻译"] === "string" &&
    typeof o["解释"] === "string" &&
    !("translationHtml" in o && o["translationHtml"])
  );
}

function isV3Entry(e: unknown): e is DoubaoWordbookEntry {
  if (!isV2Entry(e)) return false;
  const o = e as unknown as Record<string, unknown>;
  return o["source"] === "doubao" || o["source"] === "siphon";
}

function saveStore(store: WordbookStore) {
  if (hasGmStorage()) {
    gm().GM_setValue!(STORAGE_KEY, store);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** 清空本地生词本（GM / localStorage 同步写入空数组） */
function clearWordbookStore() {
  saveStore({ version: 3, entries: [] });
  updateBarCount();
  toast("已清空生词本");
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ISO 时间按用户本地时区展示（避免直接 slice UTC 字符串） */
function formatSavedAtLocal(iso: string): string {
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

/** 有道词典朗读：`audio` 为单词原文，`type=2` 为英音 */
function youdaoDictVoiceUrl(word: string): string {
  const w = word.trim();
  if (!w) return "";
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w)}&type=2`;
}

/** 导出 JSON 时为每条追加「发音链接」（不落库，仅导出展示用） */
function buildJsonExportPayload(store: WordbookStore): { version: number; entries: unknown[] } {
  return {
    version: store.version,
    entries: store.entries.map((e) => ({
      ...e,
      发音链接: youdaoDictVoiceUrl(e.单词),
    })),
  };
}

/** 「查看」弹窗表格单元格样式（随暗黑/亮色切换） */
type PreviewTablePalette = { cellBorder: string; cellText: string };

/** 「查看」表格：多行字段保留换行；字面量 &lt;br&gt; 视为换行（textContent + pre-wrap，不解析 HTML） */
function setPreviewTableCellContent(td: HTMLElement, raw: string, multiline: boolean, palette: PreviewTablePalette) {
  const base =
    `padding:8px 10px;border:1px solid ${palette.cellBorder};vertical-align:top;word-break:break-word;max-width:220px;color:${palette.cellText};`;
  if (multiline) {
    const text = String(raw ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n");
    td.textContent = text;
    td.style.cssText = base + "white-space:pre-wrap;";
  } else {
    td.textContent = raw;
    td.style.cssText = base;
  }
}

/** 与右下角浮层共用 readBarTheme() */
function buildPreviewModalUi() {
  const dark = readBarTheme() === "dark";
  if (dark) {
    return {
      dark: true,
      backdrop:
        "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.58);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;",
      panel:
        "background:#111827;border:1px solid #374151;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.55);" +
        "max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;",
      header:
        "display:flex;align-items:center;justify-content:space-between;gap:12px;" +
        "padding:12px 14px;border-bottom:1px solid #374151;flex-shrink:0;",
      title: "font:600 15px/1.3 system-ui,sans-serif;color:#f9fafb;",
      clearBtn:
        "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #991b1b;background:#450a0a;color:#fecaca;font:13px system-ui,sans-serif;",
      closeBtn:
        "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;font:13px system-ui,sans-serif;",
      scrollWrap: `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;background:#111827;`,
      empty: "margin:0;color:#9ca3af;font:13px/1.5 system-ui,sans-serif;",
      table: "width:100%;min-width:820px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#e5e7eb;",
      th: "position:sticky;top:0;background:#1f2937;padding:8px 10px;border:1px solid #374151;text-align:left;font-weight:600;white-space:nowrap;z-index:1;color:#e5e7eb;",
      legend:
        "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#fecaca;background:#450a0a;padding:8px 10px;border-radius:8px;border:1px solid #991b1b;",
      dupRowBg: "rgba(127,29,29,.4)",
      palette: {
        cellBorder: "#374151",
        cellText: "#e5e7eb",
      } satisfies PreviewTablePalette,
      link: "#60a5fa",
      linkMuted: "#9ca3af",
    };
  }
  return {
    dark: false,
    backdrop:
      "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);" +
      "display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;",
    panel:
      "background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.22);" +
      "max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;",
    header:
      "display:flex;align-items:center;justify-content:space-between;gap:12px;" +
      "padding:12px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;",
    title: "font:600 15px/1.3 system-ui,sans-serif;color:#111827;",
    clearBtn:
      "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;font:13px system-ui,sans-serif;",
    closeBtn:
      "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font:13px system-ui,sans-serif;",
    scrollWrap: `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;background:#fff;`,
    empty: "margin:0;color:#6b7280;font:13px/1.5 system-ui,sans-serif;",
    table: "width:100%;min-width:820px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#111827;",
    th: "position:sticky;top:0;background:#f9fafb;padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:600;white-space:nowrap;z-index:1;color:#111827;",
    legend:
      "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#991b1b;background:#fef2f2;padding:8px 10px;border-radius:8px;border:1px solid #fecaca;",
    dupRowBg: "#fef2f2",
    palette: {
      cellBorder: "#e5e7eb",
      cellText: "#111827",
    } satisfies PreviewTablePalette,
    link: "#2563eb",
    linkMuted: "#6b7280",
  };
}

/** 从 stream-message-done 内解析豆包译文结构（含列表式与「核心含义+ol/ul」混排） */
function parseDoubaoTranslation(
  rootEl: Element,
  wordHint: string
): Omit<DoubaoWordbookEntry, "id" | "savedAt" | "pageUrl" | "pageTitle" | "source"> {
  const body =
    rootEl.querySelector("[class*='flow-markdown-body']") ??
    rootEl.querySelector(".flow-markdown-body") ??
    rootEl;

  const firstBlock =
    body.querySelector("[class*='paragraph-element'], .paragraph-element, p") ?? body.firstElementChild;

  let 解释 = "";
  let 翻译 = "";
  let 音标 = "";

  if (firstBlock) {
    let raw = (firstBlock.textContent ?? "").replace(/\s+/g, " ").trim();
    /** 首段末尾内联：<strong>音标</strong>：英 … 美 … */
    const inlinePh = raw.match(/\s*音标\s*[：:]\s*(.+)$/);
    if (inlinePh) {
      音标 = inlinePh[1]!.trim();
      raw = raw.slice(0, inlinePh.index).trim();
    }
    解释 = raw;
    const strs: string[] = [];
    firstBlock.querySelectorAll("strong").forEach((s) => {
      const v = s.textContent?.trim();
      if (v && v !== "音标") strs.push(v);
    });
    翻译 = strs.join("、");
  }

  /** 有序列表中的「动词 (v.)：…」「名词 (n.)：…」等，作词性/义项说明 */
  const olLines: string[] = [];
  body.querySelectorAll("ol > li").forEach((li) => {
    const text = (li.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (/(动词|名词|形容词|副词|介词|连词|数词|冠词|\([nva]\.\)|\(adj\.\)|\(adv\.\))/.test(text)) {
      olLines.push(text);
    }
  });

  let 词性 = "";
  const colloqLines: string[] = [];
  const exampleLines: string[] = [];

  let phase: "normal" | "collocations" = "normal";
  for (const li of Array.from(body.querySelectorAll("ul > li"))) {
    const text = (li.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (/词性\s*[：:]/.test(text)) {
      词性 = text.replace(/^.*?词性\s*[：:]\s*/, "").trim();
      phase = "normal";
      continue;
    }
    if (!音标 && (/^音标\s*[：:]/.test(text) || (/音标/.test(text) && /[：:]/.test(text)))) {
      音标 = text.replace(/^.*?音标\s*[：:]\s*/, "").trim();
      phase = "normal";
      continue;
    }
    if (/常见搭配\s*[：:]?\s*$/.test(text) || text === "常见搭配" || text === "常见搭配：") {
      phase = "collocations";
      continue;
    }
    /** 新版：以「搭配：」开头的行 */
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
    词性 = 词性 ? `${词性}\n${olLines.join("\n")}` : olLines.join("\n");
  }

  const 例句 = exampleLines.join("\n");

  const 单词 = wordHint.trim() || guessWordFromExplanation(解释);

  return {
    单词,
    翻译,
    解释,
    词性,
    音标,
    常见搭配: colloqLines.join("\n"),
    例句,
  };
}

function guessWordFromExplanation(s: string): string {
  const m = s.match(/[「『"'“‘]?([a-zA-Z][a-zA-Z\-']*)/);
  return m ? m[1]! : "";
}

/** 在单个 ShadowRoot / Document 内深度查询 */
function queryDeepWithin(root: Document | ShadowRoot, selector: string): Element | null {
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

/** 从 document 起递归进入所有 shadowRoot */
function queryDeepDocument(selector: string): Element | null {
  return queryDeepWithin(document, selector);
}

/** 从某节点所在根（含 shadow）向上优先解析翻译块 */
function findStreamMessageDone(from: Element): Element | null {
  const rootNode = from.getRootNode();
  if (rootNode instanceof ShadowRoot) {
    const hit = queryDeepWithin(rootNode, '[data-testid="stream-message-done"]');
    if (hit) return hit;
  }
  return queryDeepDocument('[data-testid="stream-message-done"]');
}

/** 根据豆包面板 DOM 提取划词（class 哈希可能变，用包含 select-content 的节点） */
function extractWordFromPanel(doneEl: Element): string {
  const panel =
    doneEl.closest('[class*="inner-"]') ||
    doneEl.closest(".stream-message-container-qDS1M6")?.parentElement ||
    doneEl.parentElement?.parentElement?.parentElement;
  const wordEl = panel?.querySelector("[class*='select-content']");
  const t = wordEl?.textContent?.trim();
  return t || "";
}

function downloadBlob(filename: string, content: string, mime: string) {
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

const MD_FIELDS: (keyof Pick<
  DoubaoWordbookEntry,
  "单词" | "翻译" | "解释" | "词性" | "音标" | "常见搭配" | "例句"
>)[] = ["单词", "翻译", "解释", "词性", "音标", "常见搭配", "例句"];

function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
}

const PREVIEW_MODAL_ID = "tmjs-doubao-wordbook-preview";
/** 表格区域最大高度，超出则内部滚动 */
const PREVIEW_SCROLL_MAX_HEIGHT = "min(65vh, 480px)";

/** 重复收录判断：同一「单词」字段（去首尾空白、英文小写）出现次数 > 1 */
function normalizeWordKey(word: string): string {
  return word.trim().toLowerCase();
}

function countWordOccurrences(entries: DoubaoWordbookEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const k = normalizeWordKey(e.单词);
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
  backdrop.setAttribute("aria-label", "生词本内容");
  backdrop.style.cssText = ui.backdrop;

  const stopBackdropClose = (e: MouseEvent) => e.stopPropagation();
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
  title.textContent = `生词本内容（${store.entries.length} 条）`;
  const headerActions = document.createElement("div");
  headerActions.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清空";
  clearBtn.title = "清空本地全部词条（不可恢复）";
  clearBtn.style.cssText = ui.clearBtn;
  clearBtn.addEventListener("click", () => {
    if (!confirm("确定清空本地生词本？此操作不可恢复。")) return;
    clearWordbookStore();
    close();
  });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "关闭";
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
    empty.textContent = "暂无词条，可从豆包翻译面板或 Siphon 划词加入。";
    scrollWrap.appendChild(empty);
  } else {
    const wordOccurrences = countWordOccurrences(store.entries);
    const table = document.createElement("table");
    table.style.cssText = ui.table;
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const heads = ["#", "来源", "单词", "发音", "翻译", "解释", "词性", "音标", "常见搭配", "例句", "保存时间", "操作"];
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
      legend.textContent = "淡红底色为曾重复收录的单词，建议重点复习。";
      scrollWrap.appendChild(legend);
    }
    const tbody = document.createElement("tbody");
    const pal = ui.palette;
    store.entries.forEach((e, i) => {
      const tr = document.createElement("tr");
      const wk = normalizeWordKey(e.单词);
      const dup = wk && (wordOccurrences.get(wk) ?? 0) > 1;
      if (dup) {
        tr.style.backgroundColor = ui.dupRowBg;
        tr.title = "该单词曾重复收录，建议重点复习";
      }
      const sourceLabel = e.source === "siphon" ? "siphon" : "豆包";
      const voiceUrl = youdaoDictVoiceUrl(e.单词);
      const cells = [
        String(i + 1),
        sourceLabel,
        e.单词,
        voiceUrl,
        e.翻译,
        e.解释,
        e.词性,
        e.音标,
        e.常见搭配,
        e.例句,
        formatSavedAtLocal(e.savedAt),
        "", // 操作列占位
      ];
      cells.forEach((raw, colIdx) => {
        const td = document.createElement("td");
        if (colIdx === 3) {
          const base =
            `padding:8px 10px;border:1px solid ${pal.cellBorder};vertical-align:top;word-break:break-word;max-width:280px;color:${pal.cellText};`;
          td.style.cssText = base;
          if (raw) {
            const a = document.createElement("a");
            a.href = raw;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = "有道发音";
            a.style.cssText = `color:${ui.link};font-weight:500;`;
            td.appendChild(a);
            const sub = document.createElement("div");
            sub.style.cssText = `font-size:11px;color:${ui.linkMuted};margin-top:4px;word-break:break-all;`;
            sub.textContent = raw;
            td.appendChild(sub);
          } else {
            td.textContent = "—";
          }
          tr.appendChild(td);
          return;
        }
        if (colIdx === 11) {
          // 操作列：跳转到原文
          td.style.cssText = `padding:8px 10px;border:1px solid ${pal.cellBorder};vertical-align:top;`;
          if (e.pageUrl) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "跳转";
            btn.style.cssText = `cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid ${ui.dark ? "#4b5563" : "#d1d5db"};background:${ui.dark ? "#1f2937" : "#f9fafb"};color:${ui.dark ? "#e5e7eb" : "#111827"};font:inherit;`;
            btn.title = e.wordXPath ? "跳转到原文并滚动到单词位置" : "跳转到原文页面";
            btn.addEventListener("click", () => navigateToEntryPosition(e));
            td.appendChild(btn);
          }
          tr.appendChild(td);
          return;
        }
        /** 翻译～例句 可能含 \n 或字面量 br */
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

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

function buildMarkdownExport(store: WordbookStore): string {
  const lines: string[] = [
    "# 本地生词本",
    "",
    `> 导出时间：${new Date().toISOString()}`,
    `> 条目数：${store.entries.length}`,
    "",
  ];
  for (const e of store.entries) {
    lines.push("---", "");
    lines.push(`## ${e.单词 || "（无单词）"}`, "");
    lines.push(`- **来源**：${e.source === "siphon" ? "siphon" : "豆包"}`);
    lines.push(`- **保存时间**：${formatSavedAtLocal(e.savedAt)}`);
    lines.push(`- **页面标题**：${e.pageTitle}`);
    lines.push(`- **页面 URL**：${e.pageUrl}`);
    lines.push("", "| 字段 | 内容 |", "| --- | --- |");
    for (const key of MD_FIELDS) {
      const val = (e[key] ?? "").trim();
      lines.push(`| ${key} | ${mdEscapeCell(val || "—")} |`);
      if (key === "单词") {
        const u = youdaoDictVoiceUrl(e.单词);
        lines.push(`| 发音链接 | ${mdEscapeCell(u || "—")} |`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function toast(msg: string) {
  if (!isTopWindow()) return;
  const id = "tmjs-doubao-wordbook-toast";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText =
      "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);" +
      "padding:10px 16px;background:#111c;color:#fff;border-radius:8px;font:13px/1.4 system-ui,sans-serif;" +
      "box-shadow:0 4px 24px rgba(0,0,0,.2);pointer-events:none;max-width:90vw;";
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

/** 从 GM 同步折叠状态（多标签页、多站点间一致） */
function syncFloatingBarCollapsedFromStorage() {
  if (!isTopWindow()) return;
  const bar = document.getElementById("tmjs-doubao-wordbook-bar");
  if (!bar) return;
  const want = readBarCollapsed();
  if (bar.dataset.collapsed === (want ? "1" : "0")) return;
  applyBarCollapsedDom(bar, want);
}

/** 从 GM 同步浮层主题（多标签页一致） */
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

  /** 折叠态：展开图标 + 关闭（本页移除） */
  const collapsedWrap = document.createElement("div");
  collapsedWrap.dataset.tmjsBarCollapsedWrap = "";
  collapsedWrap.style.cssText = "display:none;align-items:center;gap:4px;flex-shrink:0;";

  const fab = document.createElement("button");
  fab.type = "button";
  fab.dataset.tmjsBarFab = "";
  fab.setAttribute("aria-label", "展开生词本");
  fab.title = "展开生词本";
  fab.style.cssText =
    ICON_BTN_BASE + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
  fab.innerHTML = SVG_CHEVRON_UP;
  fab.addEventListener("click", () => {
    saveBarCollapsed(false);
    applyBarCollapsedDom(bar, false);
  });

  const closeCollapsed = document.createElement("button");
  closeCollapsed.type = "button";
  closeCollapsed.dataset.tmjsBarClose = "";
  closeCollapsed.dataset.tmjsBarCollapsedClose = "1";
  closeCollapsed.setAttribute("aria-label", "关闭生词本工具条");
  closeCollapsed.title = "关闭（仅本页）";
  closeCollapsed.style.cssText =
    ICON_BTN_BASE + "width:22px;height:22px;border-radius:50%;flex-shrink:0;";
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
  label.append("生词本 ");
  const countEl = document.createElement("strong");
  countEl.id = "tmjs-doubao-wordbook-count";
  countEl.textContent = "0";
  label.append(countEl, " 条");

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.dataset.tmjsBarCollapse = "";
  collapseBtn.setAttribute("aria-label", "收起为生词本图标");
  collapseBtn.title = "收起";
  collapseBtn.style.cssText =
    ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
  collapseBtn.innerHTML = SVG_CHEVRON_DOWN;
  collapseBtn.addEventListener("click", () => {
    saveBarCollapsed(true);
    applyBarCollapsedDom(bar, true);
  });

  const closeExpanded = document.createElement("button");
  closeExpanded.type = "button";
  closeExpanded.dataset.tmjsBarClose = "";
  closeExpanded.dataset.tmjsBarExpandedClose = "1";
  closeExpanded.setAttribute("aria-label", "关闭生词本工具条");
  closeExpanded.title = "关闭（仅本页）";
  closeExpanded.style.cssText =
    ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
  closeExpanded.innerHTML = SVG_CLOSE_MD;
  closeExpanded.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissFloatingBarForPage();
  });

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.dataset.tmjsBarThemeToggle = "";
  themeBtn.setAttribute("aria-label", readBarTheme() === "dark" ? "切换为亮色" : "切换为暗黑");
  themeBtn.title = readBarTheme() === "dark" ? "切换为亮色" : "切换为暗黑";
  themeBtn.innerHTML = readBarTheme() === "dark" ? SVG_SUN : SVG_MOON;
  themeBtn.addEventListener("click", () => {
    const next: "light" | "dark" = readBarTheme() === "dark" ? "light" : "dark";
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

  const mkBtn = (text: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText =
      "cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;font:inherit;";
    b.addEventListener("click", onClick);
    return b;
  };

  body.appendChild(
    mkBtn("查看", () => {
      openWordbookPreviewModal();
    })
  );
  const jsonExport = mkBtn("JSON", () => {
    const store = loadStore();
    downloadBlob(
      `doubao-wordbook-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(buildJsonExportPayload(store), null, 2),
      "application/json;charset=utf-8"
    );
    toast("已下载 JSON");
  });
  jsonExport.title = "导出 .json";
  body.appendChild(jsonExport);

  const mdExport = mkBtn("MD", () => {
    const store = loadStore();
    downloadBlob(
      `doubao-wordbook-${new Date().toISOString().slice(0, 10)}.md`,
      buildMarkdownExport(store),
      "text/markdown;charset=utf-8"
    );
    toast("已下载 Markdown");
  });
  mdExport.title = "导出 .md";
  body.appendChild(mdExport);
  const clearWordbookBtn = mkBtn("清空", () => {
    if (!confirm("确定清空本地生词本？此操作不可恢复。")) return;
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

function saveEntryFromAnchor(anchor: Element) {
  const done = findStreamMessageDone(anchor);
  if (!done) {
    toast("未找到翻译内容（stream-message-done）");
    return;
  }
  const plain = (done instanceof HTMLElement ? done.innerText : done.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!plain) {
    toast("翻译内容为空");
    return;
  }
  const wordHint = extractWordFromPanel(done);
  const fields = parseDoubaoTranslation(done, wordHint);
  const store = loadStore();
  const pos = captureWordPosition();
  const entry: DoubaoWordbookEntry = {
    id: randomId(),
    savedAt: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,
    source: "doubao",
    ...fields,
    ...(pos && { wordXPath: pos.xpath, wordTextOffset: pos.offset }),
  };
  store.entries.unshift(entry);
  saveStore(store);
  updateBarCount();
  toast(entry.单词 ? `已加入生词本：${entry.单词}` : "已加入生词本");
}

type SiphonParsedFields = Omit<DoubaoWordbookEntry, "id" | "savedAt" | "pageUrl" | "pageTitle" | "source">;

const SIPHON_EXTENSION_ROOT_ID = "siphon-extension-root";

/**
 * 从 Siphon 释义文本中切分义项（n. / v. / adj. 等），用于填充「词性」列。
 * 释义仍保留完整原文在「解释」列。
 */
function parseSiphonPosFromGloss(raw: string): { 词性: string; 解释: string } {
  const 解释 = raw.replace(/\s+/g, " ").trim();
  if (!解释) return { 词性: "", 解释: "" };

  const parts = 解释
    .split(
      /(?=\s*(?:n|v|vt|vi|adj|adv|prep|conj|pron|int|num|art|abbr|pl|aux)\.\s*)/i
    )
    .map((s) => s.trim())
    .filter(Boolean);

  const senseLines: string[] = [];
  for (const part of parts) {
    const m = part.match(/^([a-z]{1,6})\.\s*(.+)$/i);
    if (m) {
      senseLines.push(`${m[1]}. ${m[2]}`);
    }
  }

  if (senseLines.length === 0) {
    return { 词性: "", 解释 };
  }

  return {
    词性: senseLines.join("\n"),
    解释,
  };
}

/**
 * 解析 Siphon 扩展弹层 DOM（#siphon-extension-root / .siphon-word-name / .siphon-mt-3）
 */
function parseSiphonExtensionPopover(root: Document | HTMLElement = document): SiphonParsedFields | null {
  const extRoot = root.querySelector(`#${SIPHON_EXTENSION_ROOT_ID}`) ?? root.querySelector(`[id="${SIPHON_EXTENSION_ROOT_ID}"]`);
  if (!extRoot) return null;
  const pop = extRoot.querySelector(".siphon-popover") ?? extRoot;
  const wordEl = pop.querySelector(".siphon-word-name");
  const word = (wordEl?.textContent ?? "").replace(/\s+/g, " ").trim();
  const body = pop.querySelector(".siphon-mt-3");
  const lines: string[] = [];
  body?.querySelectorAll("p").forEach((p) => {
    const t = (p.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t) lines.push(t);
  });
  const rawGloss = lines.join("\n");
  if (!word && !rawGloss) return null;
  const { 词性, 解释 } = parseSiphonPosFromGloss(rawGloss);
  return {
    单词: word || "（无单词）",
    翻译: "",
    解释,
    词性,
    音标: "",
    常见搭配: "",
    例句: "",
  };
}

function siphonEntryContentFingerprint(fields: Pick<DoubaoWordbookEntry, "单词" | "解释" | "词性">): string {
  return `${normalizeWordKey(fields.单词)}|${fields.词性.trim().slice(0, 200)}|${fields.解释.trim().slice(0, 500)}`;
}

function saveSiphonEntryCore(
  fields: SiphonParsedFields,
  toastMsg?: string,
  silentOnDup?: boolean,
  position?: { xpath: string; offset: number } | null
) {
  const store = loadStore();
  const entry: DoubaoWordbookEntry = {
    id: randomId(),
    savedAt: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,
    source: "siphon",
    ...fields,
    ...(position && { wordXPath: position.xpath, wordTextOffset: position.offset }),
  };
  const fp = siphonEntryContentFingerprint(entry);
  if (store.entries.some((e) => e.source === "siphon" && siphonEntryContentFingerprint(e) === fp)) {
    if (!silentOnDup) toast("该 Siphon 内容已在生词本中");
    return;
  }
  store.entries.unshift(entry);
  saveStore(store);
  updateBarCount();
  if (toastMsg) toast(toastMsg);
}

/** 划词按钮：优先合并当前页 Siphon 弹层解析结果 */
function saveEntryFromSiphonSelection(word: string, savedRange?: Range | null) {
  const w = word.trim();
  if (!w) return;
  const parsed = parseSiphonExtensionPopover(document);
  let fields: SiphonParsedFields;
  if (parsed && normalizeWordKey(parsed.单词) === normalizeWordKey(w)) {
    fields = { ...parsed, 单词: w };
  } else if (parsed?.解释) {
    fields = {
      单词: w,
      翻译: "",
      解释: parsed.解释,
      词性: parsed.词性,
      音标: "",
      常见搭配: "",
      例句: "",
    };
  } else {
    fields = {
      单词: w,
      翻译: "",
      解释: "",
      词性: "",
      音标: "",
      常见搭配: "",
      例句: "",
    };
  }
  // 记录手动保存时间，防止 2 秒内的自动捕获重复保存
  siphonLastManualSaveTime = Date.now();
  const pos = captureWordPosition(savedRange);
  saveSiphonEntryCore(fields, `已加入生词本（siphon）：${fields.单词}`, false, pos);
}

let siphonPopoverObserveTimer = 0;
/** 最近一次手动保存的时间戳（毫秒），用于防止自动捕获重复保存） */
let siphonLastManualSaveTime = 0;

function tryAutoCaptureSiphonPopover() {
  // 如果最近 2 秒内手动保存过，跳过自动捕获
  if (Date.now() - siphonLastManualSaveTime < 2000) {
    return;
  }
  const parsed = parseSiphonExtensionPopover(document);
  if (!parsed || !parsed.解释.trim()) return;
  saveSiphonEntryCore(parsed, `已从 Siphon 同步：${parsed.单词}`, true);
}

function initSiphonExtensionRootObserver() {
  const mo = new MutationObserver(() => {
    window.clearTimeout(siphonPopoverObserveTimer);
    siphonPopoverObserveTimer = window.setTimeout(() => {
      try {
        tryAutoCaptureSiphonPopover();
      } catch (e) {
      }
    }, 450);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

function injectAddButtons() {
  searchShadowForToolbar(document);
}

/**
 * 在指定根上监听子树变化。豆包 UI 多在 Shadow DOM 里，只监听 document 无法感知内部插入，需对每个 ShadowRoot 单独 observe。
 */
function ensureMutationObserverOnRoot(root: Document | ShadowRoot) {
  if (observedMutationRoots.has(root)) return;
  observedMutationRoots.add(root);
  const mo = new MutationObserver(() => {
    queueMicrotask(() => {
      try {
        injectAddButtons();
      } catch (e) {
      }
    });
  });
  mo.observe(root === document ? document.documentElement : root, {
    childList: true,
    subtree: true,
  });
}

function searchShadowForToolbar(root: Document | ShadowRoot) {
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
    btn.textContent = "生词本";
    btn.setAttribute("aria-label", "加入生词本");
    btn.className = copyBtn.className;
    btn.title = "将当前翻译结果加入本地生词本";
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

/** ---------- 划词悬浮条：模拟右键，便于 Siphon 等扩展上下文菜单 ---------- */

const SIPHON_SELECTION_TOOLBAR_ID = "tmjs-selection-siphon-toolbar";

/** 控制台过滤 `[tmjs-siphon]` 可只看本段日志 */
function siphonLog(msg: string, extra?: unknown): void {
}

let siphonPendingRange: Range | null = null;
let siphonToolbarShownAt = 0;
const SIPHON_TOOLBAR_HIDE_GUARD_MS = 800;

function inSiphonToolbarGuardWindow(): boolean {
  return Date.now() - siphonToolbarShownAt < SIPHON_TOOLBAR_HIDE_GUARD_MS;
}

function isEditableForSiphon(el: Element | null): boolean {
  if (!el) return false;
  const t = el.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  return !!el.closest("[contenteditable='true'], [contenteditable='']");
}

function hideSiphonSelectionToolbar() {
  document.getElementById(SIPHON_SELECTION_TOOLBAR_ID)?.remove();
}

/** 豆包原生浮层容器：tag 为 doubao-ai-csui，class 前缀为 rootContainer-（hash 后缀不固定） */
function findDoubaoNativeRootContainer(): HTMLElement | null {
  const hosts = Array.from(document.querySelectorAll("doubao-ai-csui"));
  siphonLog("findDoubaoNativeRootContainer: 扫描宿主", { hostCount: hosts.length });
  for (const host of hosts) {
    const root = host as HTMLElement;
    if (Array.from(root.classList).some((c) => c.startsWith("rootContainer-"))) {
      siphonLog("findDoubaoNativeRootContainer: 命中宿主自身 class 前缀", {
        className: root.className,
      });
      return root;
    }
    // light DOM 精确前缀匹配
    const inner = root.querySelector<HTMLElement>('[class^="rootContainer-"]');
    if (inner) {
      siphonLog("findDoubaoNativeRootContainer: 命中宿主内部 class 前缀", {
        className: inner.className,
      });
      return inner;
    }

    // 兜底：light DOM 里任意 class token 以前缀命中（防止 rootContainer-* 不是首个 class）
    const lightAny = Array.from(root.querySelectorAll<HTMLElement>("*")).find((el) =>
      Array.from(el.classList).some((c) => c.startsWith("rootContainer-"))
    );
    if (lightAny) {
      siphonLog("findDoubaoNativeRootContainer: 命中 light DOM class token 前缀", {
        className: lightAny.className,
      });
      return lightAny;
    }

    // 关键：很多 doubao-ai-csui 实际把内容渲染到 shadowRoot
    const sr = root.shadowRoot;
    if (sr) {
      const shadowByPrefix = sr.querySelector<HTMLElement>('[class^="rootContainer-"]');
      if (shadowByPrefix) {
        siphonLog("findDoubaoNativeRootContainer: 命中 shadowRoot class 前缀", {
          className: shadowByPrefix.className,
        });
        return shadowByPrefix;
      }
      const shadowAny = Array.from(sr.querySelectorAll<HTMLElement>("*")).find((el) =>
        Array.from(el.classList).some((c) => c.startsWith("rootContainer-"))
      );
      if (shadowAny) {
        siphonLog("findDoubaoNativeRootContainer: 命中 shadowRoot class token 前缀", {
          className: shadowAny.className,
        });
        return shadowAny;
      }
      siphonLog("findDoubaoNativeRootContainer: 宿主存在 shadowRoot，但未命中 rootContainer-*");
    }
  }
  siphonLog("findDoubaoNativeRootContainer: 未找到 rootContainer-*");
  return null;
}

function attachSiphonToolbarIntoDoubao(bar: HTMLElement): boolean {
  const nativeDoubao = findDoubaoNativeRootContainer();
  if (!nativeDoubao) {
    siphonLog("attachSiphonToolbarIntoDoubao: 未找到豆包容器");
    return false;
  }
  const cs = window.getComputedStyle(nativeDoubao);
  if (cs.position === "static") {
    siphonLog("attachSiphonToolbarIntoDoubao: 容器为 static，改为 relative");
    nativeDoubao.style.position = "relative";
  }
  bar.style.cssText =
    "position:absolute;right:-56px;top:50%;transform:translateY(-50%);" +
    "display:flex;align-items:center;pointer-events:auto;z-index:2147483647;";
  nativeDoubao.appendChild(bar);
  siphonLog("attachSiphonToolbarIntoDoubao: 已挂载到豆包容器", {
    className: nativeDoubao.className,
    tagName: nativeDoubao.tagName,
  });
  return true;
}

function getPageWindowForEvents(): Window {
  const g = globalThis as unknown as { unsafeWindow?: Window };
  return g.unsafeWindow ?? window;
}

/** 扩展读的是页面选区，必须用 unsafeWindow.getSelection，不能用沙箱里的 window.getSelection */
function applyRangeToPageSelection(range: Range, tag: string): void {
  const pw = getPageWindowForEvents();
  const sel = pw.getSelection();
  if (!sel) {
    siphonLog(`applyRangeToPageSelection(${tag}): page getSelection() 为 null`);
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
      rangeCollapsed: range.collapsed,
    });
  } catch (err) {
    siphonLog(`applyRangeToPageSelection(${tag}) 抛错`, err);
    throw err;
  }
}

/** 右键菜单弹出后选区常被清空，扩展执行菜单时读不到字；多次把选区写回页面 */
function scheduleReselectRange(range: Range) {
  const run = (label: string) => {
    try {
      applyRangeToPageSelection(range.cloneRange(), `reapply:${label}`);
    } catch (err) {
      siphonLog(`scheduleReselectRange(${label}) 失败`, err);
    }
  };
  siphonLog("scheduleReselectRange 开始，将多次写回选区");
  requestAnimationFrame(() => run("rAF"));
  setTimeout(() => run("0ms"), 0);
  setTimeout(() => run("32ms"), 32);
  setTimeout(() => run("100ms"), 100);
  setTimeout(() => run("200ms"), 200);
  setTimeout(() => run("400ms"), 400);
}

/** 在页面 realm 派发右键序列；沙箱内 MouseEvent/view 会导致扩展不响应或构造失败 */
function dispatchContextMenuAtSelectionRange(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    siphonLog("dispatchContextMenuAtSelectionRange: 选区 rect 宽高为 0，中止", { rect });
    return;
  }
  const pw = getPageWindowForEvents();
  const x = Math.min(pw.innerWidth - 1, Math.max(0, Math.round(rect.left + rect.width / 2)));
  const y = Math.min(pw.innerHeight - 1, Math.max(0, Math.round(rect.top + rect.height / 2)));
  const doc = pw.document;
  const target = doc.elementFromPoint(x, y) ?? doc.body;
  const MouseEv = (pw as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent;
  const PointerEv = (pw as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  const base: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: pw,
    clientX: x,
    clientY: y,
    screenX: x + pw.screenX,
    screenY: y + pw.screenY,
    button: 2,
    buttons: 2,
  };
  siphonLog("dispatchContextMenuAtSelectionRange", {
    x,
    y,
    rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
    targetTag: target.tagName,
    targetId: (target as HTMLElement).id || "(无)",
    targetClass: typeof (target as HTMLElement).className === "string" ? String((target as HTMLElement).className).slice(0, 80) : "",
  });

  // 尽量让目标节点处于可交互状态（部分站点/扩展依赖 activeElement / focus）
  try {
    (target as HTMLElement | null)?.focus?.({ preventScroll: true } as unknown as FocusOptions);
  } catch {
    // ignore
  }

  const dispatchAndLog = (type: string, ev: Event) => {
    const ok = target.dispatchEvent(ev);
    siphonLog("dispatchEvent", {
      type,
      ok,
      isTrusted: (ev as unknown as { isTrusted?: boolean }).isTrusted ?? "(unknown)",
    });
    return ok;
  };

  // 有些扩展监听 pointer 事件而不是 mouse 事件
  if (PointerEv) {
    dispatchAndLog("pointerdown", new PointerEv("pointerdown", { ...base, pointerType: "mouse", isPrimary: true } as PointerEventInit));
    dispatchAndLog("pointerup", new PointerEv("pointerup", { ...base, pointerType: "mouse", isPrimary: true } as PointerEventInit));
  }

  // 右键链路：mousedown/up/contextmenu（补齐 which=3）
  dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 3 } as MouseEventInit));
  dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 3 } as MouseEventInit));
  dispatchAndLog("contextmenu", new MouseEv("contextmenu", { ...base, which: 3 } as MouseEventInit));
}

/** 尝试触发扩展快捷键：Alt(Option)+双击选词（仍是合成事件，是否生效取决于扩展实现） */
function dispatchAltDblClickAtSelectionRange(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    siphonLog("dispatchAltDblClickAtSelectionRange: 选区 rect 宽高为 0，中止", { rect });
    return;
  }
  const pw = getPageWindowForEvents();
  const x = Math.min(pw.innerWidth - 1, Math.max(0, Math.round(rect.left + rect.width / 2)));
  const y = Math.min(pw.innerHeight - 1, Math.max(0, Math.round(rect.top + rect.height / 2)));
  const doc = pw.document;
  const target = doc.elementFromPoint(x, y) ?? doc.body;
  const MouseEv = (pw as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent;
  const PointerEv = (pw as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;

  const base: MouseEventInit = {
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
    altKey: true,
  };

  siphonLog("dispatchAltDblClickAtSelectionRange", {
    x,
    y,
    rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
    targetTag: target.tagName,
    targetId: (target as HTMLElement).id || "(无)",
  });

  try {
    (target as HTMLElement | null)?.focus?.({ preventScroll: true } as unknown as FocusOptions);
  } catch {
    // ignore
  }

  const dispatchAndLog = (type: string, ev: Event) => {
    const ok = target.dispatchEvent(ev);
    siphonLog("dispatchEvent", {
      type,
      ok,
      isTrusted: (ev as unknown as { isTrusted?: boolean }).isTrusted ?? "(unknown)",
      altKey: (ev as unknown as { altKey?: boolean }).altKey ?? "(unknown)",
      detail: (ev as unknown as { detail?: number }).detail ?? "(unknown)",
    });
    return ok;
  };

  if (PointerEv) {
    dispatchAndLog("pointerdown", new PointerEv("pointerdown", { ...base, pointerType: "mouse", isPrimary: true } as PointerEventInit));
    dispatchAndLog("pointerup", new PointerEv("pointerup", { ...base, pointerType: "mouse", isPrimary: true } as PointerEventInit));
  }

  // 常见双击链路：mousedown/up/click/mousedown/up/click/dblclick（这里用 detail=2 简化）
  dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 1, detail: 1 } as MouseEventInit));
  dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 1, detail: 1 } as MouseEventInit));
  dispatchAndLog("click", new MouseEv("click", { ...base, which: 1, detail: 1 } as MouseEventInit));

  dispatchAndLog("mousedown", new MouseEv("mousedown", { ...base, which: 1, detail: 2 } as MouseEventInit));
  dispatchAndLog("mouseup", new MouseEv("mouseup", { ...base, which: 1, detail: 2 } as MouseEventInit));
  dispatchAndLog("click", new MouseEv("click", { ...base, which: 1, detail: 2 } as MouseEventInit));
  dispatchAndLog("dblclick", new MouseEv("dblclick", { ...base, which: 1, detail: 2 } as MouseEventInit));
}

function showSiphonSelectionToolbar(rect: DOMRect) {
  hideSiphonSelectionToolbar();
  siphonToolbarShownAt = Date.now();
  siphonLog("showSiphonSelectionToolbar: 开始渲染", {
    rect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
  });
  const bar = document.createElement("div");
  bar.id = SIPHON_SELECTION_TOOLBAR_ID;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "翻译并加入生词本");
  btn.title =
    "优先尝试触发 Siphon 快捷键：Alt(Option)+双击选词；不行再模拟右键（扩展是否响应合成事件因环境而异）";
  btn.style.cssText =
    "cursor:pointer;width:24px;height:24px;padding:0;border-radius:6px;border:none;background:#6366f1;color:#fff;" +
    "display:inline-flex;align-items:center;justify-content:center;";
  btn.innerHTML = SVG_PLUS_SM;
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    siphonLog("按钮点击: 开始");
    if (!siphonPendingRange) {
      siphonLog("按钮点击: siphonPendingRange 为空，退出");
      return;
    }
    const saved = siphonPendingRange.cloneRange();
    const text = saved.toString().trim();
    siphonLog("按钮点击: 已克隆 Range", {
      textLength: text.length,
      textPreview: text.slice(0, 160),
    });
    hideSiphonSelectionToolbar();
    siphonPendingRange = null;
    if (text) {
      saveEntryFromSiphonSelection(text, saved);
    }
    try {
      applyRangeToPageSelection(saved, "button-click");
      dispatchAltDblClickAtSelectionRange(saved);
      dispatchContextMenuAtSelectionRange(saved);
      scheduleReselectRange(saved);
      /** 部分扩展在选区被菜单抢焦点后改读剪贴板，作后备 */
      if (text && typeof navigator.clipboard?.writeText === "function") {
        void navigator.clipboard.writeText(text).then(
          () => siphonLog("clipboard.writeText 成功", { len: text.length }),
          (err) => siphonLog("clipboard.writeText 失败", err)
        );
      } else {
        siphonLog("跳过剪贴板", {
          hasText: !!text,
          hasClipboard: typeof navigator.clipboard?.writeText === "function",
        });
      }
      siphonLog("按钮点击: 流程结束（异步 reapply 仍会打日志）");
    } catch (err) {
      siphonLog("按钮点击: catch", err);
    }
  });

  bar.appendChild(btn);

  const mountFallbackNearSelection = () => {
    // 首次渲染时 bar 还未挂到 DOM，不能用 getElementById 判断
    bar.style.cssText =
      "position:fixed;z-index:2147483645;display:flex;align-items:center;gap:4px;" +
      "padding:4px 6px;background:#1f2937;color:#f9fafb;border-radius:7px;" +
      "font:12px/1.25 system-ui,-apple-system,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.22);" +
      "pointer-events:auto;max-width:min(90vw,320px);";

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
    siphonLog("showSiphonSelectionToolbar: fallback 已渲染可见", { left, top });
  };

  // 先保证用户能看到按钮，再异步搬运到豆包标签内部
  mountFallbackNearSelection();

  // 延迟重试，等豆包浮层完全出现后再挂载到其内部
  const MAX_TRIES = 12;
  const RETRY_MS = 120;
  let tries = 0;
  const tryMount = () => {
    if (!bar.isConnected) {
      siphonLog("showSiphonSelectionToolbar: 工具条已不存在，停止重试");
      return;
    }
    siphonLog("showSiphonSelectionToolbar: 尝试挂载到豆包容器", {
      tryIndex: tries + 1,
      maxTries: MAX_TRIES,
    });
    try {
      if (attachSiphonToolbarIntoDoubao(bar)) return;
    } catch (err) {
      siphonLog("showSiphonSelectionToolbar: tryMount 异常", err);
    }
    tries += 1;
    if (tries >= MAX_TRIES) {
      siphonLog("showSiphonSelectionToolbar: 达到重试上限，走 fallback 定位");
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
    siphonLog("handleSiphonSelectionMouseUp: 选区快照", {
      sandboxCollapsed: sel?.isCollapsed ?? "(null)",
      sandboxLen: sel?.toString().length ?? 0,
      pageCollapsed: pageSel?.isCollapsed ?? "(null)",
      pageLen: pageSel?.toString().length ?? 0,
    });
    if (!sel || sel.isCollapsed) {
      if (inSiphonToolbarGuardWindow()) {
        siphonLog("handleSiphonSelectionMouseUp: 处于保护窗口，忽略折叠选区隐藏");
        return;
      }
      siphonLog("handleSiphonSelectionMouseUp: 无选区或折叠，不显示条");
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      if (inSiphonToolbarGuardWindow()) {
        siphonLog("handleSiphonSelectionMouseUp: 处于保护窗口，忽略空文本隐藏");
        return;
      }
      siphonLog("handleSiphonSelectionMouseUp: 文本为空");
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
      return;
    }
    const node = sel.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
    if (isEditableForSiphon(el)) {
      siphonLog("handleSiphonSelectionMouseUp: 在可编辑区域，跳过", { tag: el?.tagName });
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
      return;
    }
    let range: Range;
    try {
      range = sel.getRangeAt(0).cloneRange();
    } catch (err) {
      siphonLog("handleSiphonSelectionMouseUp: getRangeAt 失败", err);
      return;
    }
    siphonPendingRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    siphonLog("handleSiphonSelectionMouseUp: 显示悬浮条", {
      preview: text.slice(0, 100),
      rect: { w: rect.width, h: rect.height },
    });
    showSiphonSelectionToolbar(rect);
  }, 10);
}

function initSelectionSiphonToolbar() {
  if (!isTopWindow()) return;
  const g = globalThis as unknown as { unsafeWindow?: Window };
  siphonLog("initSelectionSiphonToolbar", {
    hasUnsafeWindow: !!g.unsafeWindow,
    userAgent: navigator.userAgent?.slice(0, 120),
  });

  document.addEventListener(
    "mouseup",
    (e) => {
      if (e.button !== 0) return;
      const t = e.target as Node;
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
      siphonLog("mousedown: 处于保护窗口，忽略自动隐藏");
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
      siphonLog("selectionchange: 处于保护窗口，忽略自动隐藏");
      return;
    }
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideSiphonSelectionToolbar();
      siphonPendingRange = null;
    }
  });
}

/** ---------- 单词位置记录与跳转 ---------- */

/**
 * 为指定文本节点生成 XPath。
 * 返回形如 /html[1]/body[1]/div[2]/p[3]/text()[1] 的路径。
 */
function getXPathForTextNode(textNode: Text): string {
  const parts: string[] = [];
  let current: Node | null = textNode;
  while (current && current.nodeType === Node.TEXT_NODE) {
    const parent = current.parentElement as Element | null;
    if (!parent) break;
    const siblings = Array.from(parent.childNodes).filter(
      (n: Node) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE
    );
    const index = (siblings as (Node | Text)[]).indexOf(current) + 1;
    const tag = parent.tagName.toLowerCase();
    parts.unshift(`${tag}[${index}]`);
    current = parent;
  }
  // 追加 text() 索引
  if (current && current.nodeType === Node.ELEMENT_NODE) {
    const elem = current as Element;
    const siblings = Array.from(elem.childNodes).filter((n: Node) => n.nodeType === Node.TEXT_NODE);
    const idx = (siblings as (Node | Text)[]).indexOf(textNode) + 1;
    parts.push(`text()[${idx}]`);
  }
  return "/" + parts.join("/");
}

/**
 * 根据 XPath（支持 text()[n] 形式）查找对应文本节点。
 */
function findTextNodeByXPath(xpath: string, doc: Document): Text | null {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const node = result.singleNodeValue;
    if (node instanceof Text) return node;
    return null;
  } catch {
    return null;
  }
}

/**
 * 在页面上查找单词出现的位置并滚动到该处。
 * @param word 要查找的单词
 * @param offset 字符偏移
 * @param doc 目标文档，默认为当前文档
 * @returns 是否成功定位
 */
function scrollToWordPosition(word: string, offset: number, doc: Document = document): boolean {
  if (!word || !doc.body) return false;

  const iterator = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node: Node) => {
        const text = node.textContent ?? "";
        const idx = text.toLowerCase().indexOf(word.toLowerCase());
        return idx >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node: Text | null = null;
  let currentOffset = 0;
  while ((node = iterator.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx >= 0) {
      if (currentOffset + idx >= offset) {
        // 找到目标，滚动到该位置
        const range = doc.createRange();
        range.setStart(node, idx);
        range.setEnd(node, Math.min(idx + word.length, text.length));
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          range.startContainer.parentElement?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          return true;
        }
      }
      currentOffset += text.length;
    }
  }

  // 兜底：尝试纯文本搜索（不使用 offset）
  const fallbackWalker = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  let fallbackNode: Text | null = null;
  while ((fallbackNode = fallbackWalker.nextNode() as Text | null)) {
    const text = fallbackNode.textContent ?? "";
    if (text.toLowerCase().includes(word.toLowerCase())) {
      const range = doc.createRange();
      const fbIdx = text.toLowerCase().indexOf(word.toLowerCase());
      range.setStart(fallbackNode, fbIdx);
      range.setEnd(fallbackNode, Math.min(fbIdx + word.length, text.length));
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        fallbackNode.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
    }
  }

  return false;
}

/**
 * 捕获当前页面中选中单词的位置信息。
 * 返回 { xpath, offset } 或 null（无可用选区）。
 * @param savedRange 可选的预保存 Range（用于 Siphon 等场景，selection 可能已被 UI 操作清除）
 */
function captureWordPosition(savedRange?: Range | null): { xpath: string; offset: number } | null {
  let range: Range | null = null;
  let startContainer: Node | null = null;
  let startOffset = 0;

  if (savedRange) {
    range = savedRange;
    startContainer = range.startContainer;
    startOffset = range.startOffset;
  } else {
    // 必须用 unsafeWindow.getSelection 获取页面真实选区，而非沙箱内的 selection
    const pw = getPageWindowForEvents();
    const selection = pw.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    range = selection.getRangeAt(0);
    startContainer = range.startContainer;
    startOffset = range.startOffset;
  }

  if (!startContainer || startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = startContainer as Text;
  const xpath = getXPathForTextNode(textNode);
  return { xpath, offset: startOffset };
}

/**
 * 跳转到指定词条的原始页面并滚动到单词位置。
 */
function navigateToEntryPosition(entry: DoubaoWordbookEntry) {
  if (!entry.pageUrl) {
    toast("该词条无原始页面地址");
    return;
  }

  // 打开新标签页
  const win = window.open(entry.pageUrl, "_blank");
  if (!win) {
    toast("无法打开新标签页，请检查浏览器弹窗设置");
    return;
  }

  // 尝试在新页面中滚动到单词位置
  // 由于跨域限制，仅在同源时可操作；否则只打开页面
  if (entry.wordXPath && typeof entry.wordTextOffset === "number") {
    win.addEventListener("load", () => {
      try {
        // 尝试访问 win.document，用于同源页面
        void win.document; // 触发同源检查
        const success = scrollToWordPosition(entry.单词, entry.wordTextOffset!, win.document);
        if (!success) {
          // 尝试纯文本搜索
          scrollToWordPosition(entry.单词, 0, win.document);
        }
      } catch {
        // 跨域时无法操作新页面 DOM，仅已打开为准
      }
    }, { once: true });
  }
}

function main() {
  type Plugin = {
    id: "doubao" | "siphon";
    enabled: boolean;
    init: () => void;
  };

  const plugins: Plugin[] = [
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
          }
        };
        run();
        window.setInterval(run, 1500);
      },
    },
    {
      id: "siphon",
      enabled: FEATURES.siphon,
      init: () => {
        if (!isTopWindow()) return;
        initSiphonExtensionRootObserver();
        initSelectionSiphonToolbar();
      },
    },
  ];

  for (const p of plugins) {
    if (!p.enabled) continue;
    try {
      p.init();
    } catch (e) {
    }
  }
}

main();
