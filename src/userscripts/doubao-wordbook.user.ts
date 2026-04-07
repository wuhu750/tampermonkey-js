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

export {};

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
  单词: string;
  翻译: string;
  解释: string;
  词性: string;
  音标: string;
  常见搭配: string;
  例句: string;
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
  version: 2;
  entries: DoubaoWordbookEntry[];
}

const STORAGE_KEY = "tmjs-doubao-wordbook-v1";
/** 工具条折叠状态，与站点无关，全浏览器共享 */
const UI_COLLAPSED_KEY = "tmjs-doubao-wordbook-bar-collapsed";

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

function applyBarCollapsedDom(bar: HTMLElement, collapsed: boolean) {
  const collapsedWrap = bar.querySelector("[data-tmjs-bar-collapsed-wrap]") as HTMLElement | null;
  const panel = bar.querySelector("[data-tmjs-bar-expanded]") as HTMLElement | null;
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
      BAR_POSITION_STYLE +
        "gap:6px;align-items:stretch;padding:8px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;" +
        "font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:min(420px,92vw);"
    );
  }
  bar.dataset.collapsed = collapsed ? "1" : "0";
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
      return { version: 2, entries: [] };
    }
    const entries = parsed.entries.map((e) => migrateEntryToV2(e));
    const result: WordbookStore = { version: 2, entries };
    if (parsed.version !== 2 || parsed.entries.some((e) => !isV2Entry(e))) {
      saveStore(result);
    }
    return result;
  } catch {
    return { version: 2, entries: [] };
  }
}

function migrateEntryToV2(e: unknown): DoubaoWordbookEntry {
  if (isV2Entry(e)) return e;
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
      ...parsed,
    };
  }
  if (old.translationText) {
    return {
      id: old.id,
      savedAt: old.savedAt,
      pageUrl: old.pageUrl,
      pageTitle: old.pageTitle,
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
    单词: hint,
    翻译: "",
    解释: "",
    词性: "",
    音标: "",
    常见搭配: "",
    例句: "",
  };
}

function isV2Entry(e: unknown): e is DoubaoWordbookEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o["单词"] === "string" &&
    typeof o["翻译"] === "string" &&
    typeof o["解释"] === "string" &&
    !("translationHtml" in o && o["translationHtml"])
  );
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

/** 「查看」表格：多行字段保留换行；字面量 &lt;br&gt; 视为换行（textContent + pre-wrap，不解析 HTML） */
function setPreviewTableCellContent(td: HTMLElement, raw: string, multiline: boolean) {
  const base =
    "padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;word-break:break-word;max-width:220px;";
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

/** 从 stream-message-done 内解析豆包译文结构（含列表式与「核心含义+ol/ul」混排） */
function parseDoubaoTranslation(rootEl: Element, wordHint: string): Omit<DoubaoWordbookEntry, "id" | "savedAt" | "pageUrl" | "pageTitle"> {
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
  const backdrop = document.createElement("div");
  backdrop.id = PREVIEW_MODAL_ID;
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "生词本内容");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);" +
    "display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";

  const stopBackdropClose = (e: MouseEvent) => e.stopPropagation();
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  backdrop.addEventListener("click", () => close());

  const panel = document.createElement("div");
  panel.style.cssText =
    "background:#fff;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,.22);" +
    "max-width:min(96vw,960px);width:100%;display:flex;flex-direction:column;overflow:hidden;";
  panel.addEventListener("click", stopBackdropClose);

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:12px;" +
    "padding:12px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;";
  const title = document.createElement("div");
  title.style.cssText = "font:600 15px/1.3 system-ui,sans-serif;color:#111827;";
  title.textContent = `生词本内容（${store.entries.length} 条）`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "关闭";
  closeBtn.style.cssText =
    "cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid #d1d5db;background:#fff;font:13px system-ui,sans-serif;";
  closeBtn.addEventListener("click", close);
  header.appendChild(title);
  header.appendChild(closeBtn);

  const scrollWrap = document.createElement("div");
  scrollWrap.style.cssText =
    `overflow:auto;max-height:${PREVIEW_SCROLL_MAX_HEIGHT};padding:12px 14px;box-sizing:border-box;`;

  if (store.entries.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "margin:0;color:#6b7280;font:13px/1.5 system-ui,sans-serif;";
    empty.textContent = "暂无词条，请先在豆包翻译里加入生词本。";
    scrollWrap.appendChild(empty);
  } else {
    const wordOccurrences = countWordOccurrences(store.entries);
    const table = document.createElement("table");
    table.style.cssText =
      "width:100%;min-width:720px;border-collapse:collapse;font:12px/1.45 system-ui,sans-serif;color:#111827;";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const heads = ["#", "单词", "翻译", "解释", "词性", "音标", "常见搭配", "例句", "保存时间"];
    for (const h of heads) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      th.style.cssText =
        "position:sticky;top:0;background:#f9fafb;padding:8px 10px;border:1px solid #e5e7eb;" +
        "text-align:left;font-weight:600;white-space:nowrap;z-index:1;";
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const hasDupLegend = [...wordOccurrences.values()].some((n) => n > 1);
    if (hasDupLegend) {
      const legend = document.createElement("p");
      legend.style.cssText =
        "margin:0 0 10px;font:12px/1.4 system-ui,sans-serif;color:#991b1b;background:#fef2f2;" +
        "padding:8px 10px;border-radius:8px;border:1px solid #fecaca;";
      legend.textContent = "淡红底色为曾重复收录的单词，建议重点复习。";
      scrollWrap.appendChild(legend);
    }
    const tbody = document.createElement("tbody");
    store.entries.forEach((e, i) => {
      const tr = document.createElement("tr");
      const wk = normalizeWordKey(e.单词);
      const dup = wk && (wordOccurrences.get(wk) ?? 0) > 1;
      if (dup) {
        tr.style.backgroundColor = "#fef2f2";
        tr.title = "该单词曾重复收录，建议重点复习";
      }
      const cells = [
        String(i + 1),
        e.单词,
        e.翻译,
        e.解释,
        e.词性,
        e.音标,
        e.常见搭配,
        e.例句,
        formatSavedAtLocal(e.savedAt),
      ];
      cells.forEach((raw, colIdx) => {
        const td = document.createElement("td");
        /** 解释 / 词性 / 音标 / 常见搭配 / 例句 可能含 \n 或字面量 br */
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

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
}

function buildMarkdownExport(store: WordbookStore): string {
  const lines: string[] = [
    "# 豆包生词本",
    "",
    `> 导出时间：${new Date().toISOString()}`,
    `> 条目数：${store.entries.length}`,
    "",
  ];
  for (const e of store.entries) {
    lines.push("---", "");
    lines.push(`## ${e.单词 || "（无单词）"}`, "");
    lines.push(`- **保存时间**：${formatSavedAtLocal(e.savedAt)}`);
    lines.push(`- **页面标题**：${e.pageTitle}`);
    lines.push(`- **页面 URL**：${e.pageUrl}`);
    lines.push("", "| 字段 | 内容 |", "| --- | --- |");
    for (const key of MD_FIELDS) {
      const val = (e[key] ?? "").trim();
      lines.push(`| ${key} | ${mdEscapeCell(val || "—")} |`);
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
  label.style.cssText = "color:#374151;";
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
  closeExpanded.setAttribute("aria-label", "关闭生词本工具条");
  closeExpanded.title = "关闭（仅本页）";
  closeExpanded.style.cssText =
    ICON_BTN_BASE + "width:32px;height:32px;border-radius:8px;flex-shrink:0;";
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
  body.appendChild(
    mkBtn("导出 .json", () => {
      const store = loadStore();
      downloadBlob(
        `doubao-wordbook-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(store, null, 2),
        "application/json;charset=utf-8"
      );
      toast("已下载 JSON");
    })
  );
  body.appendChild(
    mkBtn("导出 .md", () => {
      const store = loadStore();
      downloadBlob(
        `doubao-wordbook-${new Date().toISOString().slice(0, 10)}.md`,
        buildMarkdownExport(store),
        "text/markdown;charset=utf-8"
      );
      toast("已下载 Markdown");
    })
  );
  body.appendChild(
    mkBtn("各导出一次", () => {
      const store = loadStore();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(`doubao-wordbook-${date}.json`, JSON.stringify(store, null, 2), "application/json;charset=utf-8");
      setTimeout(() => {
        downloadBlob(`doubao-wordbook-${date}.md`, buildMarkdownExport(store), "text/markdown;charset=utf-8");
        toast("已下载 JSON 与 Markdown");
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
  const entry: DoubaoWordbookEntry = {
    id: randomId(),
    savedAt: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,
    ...fields,
  };
  store.entries.push(entry);
  saveStore(store);
  updateBarCount();
  toast(entry.单词 ? `已加入生词本：${entry.单词}` : "已加入生词本");
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
        console.warn("[tmjs-doubao-wordbook]", e);
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
