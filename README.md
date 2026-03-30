# tampermonkey-js

一个可扩展的油猴（Tampermonkey）脚本工程骨架：支持**多 userscript**、`dev` 模式本地加载、并在 **Chrome DevTools** 里通过 **sourcemap** 直接断点调试源代码。

## 目录结构

- `src/userscripts/*.user.ts`: 每个文件就是一个独立的油猴脚本（带 `// ==UserScript==` 元数据块）
- `dist/`: 构建输出
  - `*.user.js`: 真实运行脚本（打包后的 iife）
  - `*.user.js.map`: sourcemap
  - `*.dev.user.js`: **开发用 stub**（安装到 Tampermonkey 后，通过 `@require http://localhost:5173/...` 加载真实脚本）

## 安装依赖

```bash
npm i
```

## 开发（推荐：Chrome 里直接调试）

启动 watch + 本地静态服务器（默认端口 5173）：

```bash
npm run dev
```

然后在浏览器里打开本机生成的开发 stub 文件并安装到 Tampermonkey：

- 安装 `dist/hello.dev.user.js`

接着访问该脚本 `@match` 对应的网站（默认模板是 `*://*/*`，即所有 http/https 网站）。

### 在 Chrome DevTools 里断点调试

- 打开 DevTools → `Sources`
- 在文件树里找到 `localhost:5173`（或通过 Ctrl/Cmd+P 搜索 `hello.user.ts`）
- 在 `main()` 里的 `console.log` 前后打断点即可验证 sourcemap 是否生效

> 小提示：`dev` 服务器设置了 `Cache-Control: no-store`，修改后刷新页面即可加载最新脚本。

## 构建（发布/安装用）

```bash
npm run build
```

构建后你可以把 `dist/*.user.js` 作为正式安装版本（不依赖本地服务器）。

## 新增一个脚本

使用脚手架命令快速创建：

```bash
npm run create -- your-script-name
```

命名规则：

- 允许字符：`a-z`、`0-9`、`-`
- 会创建文件：`src/userscripts/your-script-name.user.ts`

然后：

- 开发调试：`npm run dev`，安装 `dist/xxx.dev.user.js`
- 发布安装：`npm run build`，安装 `dist/xxx.user.js`

> 如果 `dev` 已经在运行，新增脚本后请重启一次 `npm run dev`，让 watch 纳入新入口。

