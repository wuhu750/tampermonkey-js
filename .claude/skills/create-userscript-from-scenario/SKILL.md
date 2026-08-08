---
name: create-userscript-from-scenario
description: 根据用户描述的使用场景生成并初始化 Tampermonkey UserScript。用于用户提出“写一个油猴脚本”“根据场景创建 userscript”“新建脚本模板”等请求时，先提炼脚本名并执行 npm run create -- <script-name>，再补全元数据与基础逻辑。
---

# 根据场景创建 UserScript

## 目标

将用户的“使用场景”快速转成一个可运行的 UserScript 初稿，优先复用仓库脚手架命令：

```bash
npm run create -- <script-name>
```

脚本文件会生成在 `src/userscripts/<script-name>.user.ts`。

## 执行流程

1. 理解用户场景，提炼脚本职责（做什么、在哪些站点生效、何时运行）。
2. 生成脚本名并校验命名合法性。
3. 执行 `npm run create -- <script-name>` 创建模板文件。
4. 打开新文件并按场景补全以下内容：
   - `@description`
   - `@match`
   - 入口逻辑 `main()`
5. 若用户有更细需求（按钮、菜单、网络请求、样式注入等），继续在该文件中迭代实现。

## 脚本名规则

- 只使用 `a-z`、`0-9`、`-`
- 首字符必须是字母或数字
- 用短横线分词，避免中文、空格、下划线
- 尽量体现场景核心动作与目标站点

示例：

- “知乎免登录看全文” -> `zhihu-read-fulltext`
- “B站自动展开评论” -> `bilibili-expand-comments`
- “掘金文章目录优化” -> `juejin-toc-enhancer`

## 场景到模板的映射规则

### 1) 生成 `@description`

使用一句中文，格式建议：

`在 <站点/页面> 上 <核心行为>，用于 <目的>`

示例：`在知乎文章页自动展开折叠内容，用于提升连续阅读体验`

### 2) 生成 `@match`

优先精确匹配，避免默认 `*://*/*`：

- 知乎文章页：`https://www.zhihu.com/*`
- B站：`https://www.bilibili.com/*`
- 掘金：`https://juejin.cn/*`

若用户未指定站点，先询问目标域名；若必须先交付初稿，可临时保留宽匹配并标记 TODO。

### 3) 生成入口逻辑

在 `main()` 中至少完成：

- 页面判定（防止误执行）
- 核心动作的最小可运行实现
- 错误保护（`try/catch`）和必要日志

## 标准操作命令

```bash
npm run create -- <script-name>
```

若提示脚本已存在：

1. 不覆盖现有文件；
2. 与用户确认是复用旧脚本还是新建一个新名字；
3. 若新建，给出新的 `script-name` 后再次执行命令。

## 交付检查清单

- [ ] 已成功执行 `npm run create -- <script-name>`
- [ ] 文件存在于 `src/userscripts/<script-name>.user.ts`
- [ ] `@description` 已按场景更新
- [ ] `@match` 已按站点更新
- [ ] `main()` 中有可运行的最小逻辑
- [ ] 未引入与需求无关的复杂依赖

## 响应风格

- 用中文回复用户。
- 先给出已创建的脚本路径，再简述做了哪些场景化改动。
- 信息不足时先问 1~2 个关键问题（目标站点、核心动作），避免一次性抛出太多问题。
