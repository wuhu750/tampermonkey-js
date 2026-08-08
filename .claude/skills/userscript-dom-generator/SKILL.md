---
name: "userscript-dom-generator"
description: "根据 URL + 任务描述，生成 Tampermonkey/userscript DOM 操作函数。当用户想创建一个修改特定网站页面元素（样式、宽度、可见性等）的 userscript 函数时调用。"
---

# Userscript DOM 操作函数生成器

根据用户提供的 URL 和任务描述，生成可直接使用的 userscript DOM 操作函数。

## 工作流程

### 第一步：检查目标页面的真实 DOM

**关键：绝不盲目编写选择器。必须先检查实际 DOM。**

使用浏览器工具（navigate + evaluate）检查实际 DOM 结构：

1. 用 `browser_navigate` 导航到目标 URL
2. 用 `browser_evaluate` 检查相关元素：
   - 确认实际存在哪些标签/类名/属性
   - 验证候选选择器返回的元素数量是否正确
   - 检查父子关系和 `children` 索引
   - 检查内联样式、CSS 类名和 data 属性

检查脚本示例：
```js
// 检查候选选择器
JSON.stringify({
  selectorA: document.querySelectorAll('.SomeClass').length,
  selectorB: document.querySelectorAll('div.SomeClass').length,
  // 检查元素详情
  elementInfo: (() => {
    const el = document.querySelector('.SomeClass');
    if (!el) return null;
    return {
      tag: el.tagName,
      className: el.className,
      childrenCount: el.children.length,
      children: Array.from(el.children).map((c, i) =>
        `${i}: <${c.tagName.toLowerCase()} class="${c.className}">`
      )
    };
  })()
})
```

### 第二步：选择稳定的选择器

**关键：避免硬编码打包工具生成的随机类名。**

现代网站使用 CSS Modules / CSS-in-JS 库，会生成随机类名，例如：
- `.css-16ztsy4` — 哈希值，每次构建都会变
- `.css-1a2b3c4` — 同上
- `.ktWSRj` — 压缩后的随机名称

#### 选择器优先级（从最稳定到最不稳定）

| 优先级 | 选择器类型 | 示例 | 稳定性 |
|--------|-----------|------|--------|
| 1 | 语义化 HTML 标签 | `main`、`article`、`header`、`nav` | 非常稳定 |
| 2 | 语义化类名 | `.Post-content`、`.Post-Header` | 稳定（人类可读，很少变化） |
| 3 | `data-*` 属性 | `[data-zp-detail-view-path-module]` | 稳定 |
| 4 | 结构关系 | `article > header`、`main .content` | 稳定 |
| 5 | 打包工具生成的类名 | `.css-16ztsy4` | **不稳定 — 绝不硬编码** |

#### 如何处理打包工具生成的随机类名

如果目标元素只有随机生成的类名，使用以下回退策略：

1. **找到附近的稳定祖先元素，再通过结构定位：**
   ```js
   // 错误：依赖 .css-16ztsy4
   document.querySelector('.css-16ztsy4 .content')

   // 正确：用稳定祖先 + 结构定位
   document.querySelector('.Post-content article')
   ```

2. **使用标签 + 属性选择器：**
   ```js
   document.querySelector('article[data-size="normal"]')
   ```

3. **将稳定类名片段与结构选择器组合：**
   ```js
   // 如果 .Post-RichText 稳定但 .css-16ztsy4 不稳定
   document.querySelector('.Post-RichTextContainer img')
   ```

4. **如果完全没有稳定选择器，通过结构查询并运行时验证：**
   ```js
   const container = document.querySelector('.StableParent');
   const target = container?.children[2] as HTMLElement | null;
   ```

### 第三步：生成函数

遵循以下代码模式：

```ts
function manipulatePageElement() {
  // 1. 使用稳定选择器（已通过 DOM 检查验证）
  const targetSelector = ".StableClassName"; // 或 "tag.StableClass"、结构选择器等
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) return;

  // 2. 导航到子元素（通过 DOM 检查验证索引）
  const childElement = target.children[N] as HTMLElement;
  if (!childElement) return;

  // 3. 应用修改
  childElement.style.width = "100%";

  // 4. 处理嵌套修改（例如移除子标签的属性）
  childElement.querySelectorAll<HTMLImageElement>("img[width]").forEach((img) => {
    img.removeAttribute("width");
  });

  // 5. 设置 MutationObserver，在 SPA 重新渲染时重新应用修改
  const observer = new MutationObserver(() => {
    childElement.style.width = "100%";
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
  });
}

manipulatePageElement();
```

### 命名规范

- 函数名：`camelCase`（如 `zhihuPostContent`、`expandContentWidth`）
- 局部变量：`camelCase`（如 `postContent`、`targetElement`）
- 模块级且真正不变的常量：可使用 `UPPER_SNAKE_CASE`
- 局部变量绝不使用 `UPPER_SNAKE_CASE`

### 第四步：构建和验证

在 `src/userscripts/<name>.user.ts` 中写好函数后：

1. 运行 `npm run build` 编译到 `dist/`
2. 如果条件允许，使用浏览器工具加载页面验证修改是否生效

## 注意事项

- **SPA 时序问题**：知乎、Twitter 等网站是 SPA（单页应用），元素可能在 `document-end` 时还不存在。考虑在 `document.body` 或 `document.documentElement` 上设置 `MutationObserver` 等待目标元素出现后再应用修改。
- **多种页面类型**：一条 `@match` 规则可能覆盖多种页面类型（如知乎问题页 vs 专栏文章页），选择器可能只存在于特定页面类型 — 必须做 null 检查并提前返回。
- **避免冗余查询**：不要重复查询同一个选择器，复用变量。
- **类型安全**：`element.children[N]` 返回的是 `Element` 而非 `HTMLElement`，访问 `.style` 时需用 `as HTMLElement` 断言。
- **CSS vs 内联样式**：移除样式时，需区分来源：
  - HTML 属性（如 `width="100%"`）→ 用 `removeAttribute("width")`
  - 内联样式（如 `style="width:100%"`）→ 用 `element.style.width = ""`
  - CSS 类名/规则 → 需用更高优先级覆盖或操作样式表
