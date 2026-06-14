---
title: "Chrome 浏览器控制"
description: "让 AI 用自然语言操作 Chrome 浏览器：导航、表单、数据抓取。两种实现方案对比：自托管 MCP（chrome-use-mcp）与 Chrome 原生集成（claude-in-chrome-mcp）。"
keywords: ["Chrome 浏览器控制", "MCP", "浏览器自动化", "Claude in Chrome", "网页抓取"]
---

# Chrome 浏览器控制

让 Claude Code 用自然语言直接操作 Chrome 浏览器，完成网页导航、表单填写、数据抓取、截图录制等任务。

Claude Code 提供两种浏览器控制方案：

| 方案 | 简介 | 适用场景 |
|------|------|---------|
| **Chrome Use MCP**（自托管 MCP） | 通过社区开源 MCP 扩展（`mcp-chrome`）接入，Claude Code 以 MCP 客户端方式调用 | 想自托管、可定制、不依赖 Anthropic 订阅 |
| **Claude in Chrome**（Chrome 原生集成） | Anthropic 官方扩展 + 内建工具集，通过 `--chrome` 启动参数加载 | 需要完整能力（截图/GIF/网络监控/JS 执行等），有 Claude Pro/Max/Team 订阅 |

两种方案可以独立使用，也可按需切换。下面先讲快速上手，再分别给出详细说明。

## 快速上手

### 方案一：Chrome Use MCP（3 分钟）

**第一步：安装 Chrome 扩展**

1. 下载扩展：https://github.com/hangwin/mcp-chrome/releases
2. 解压 zip 文件
3. 打开 Chrome 访问 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

**第二步：启动 Claude Code**

```bash
bun run dev
ccb # 或者 ccb 安装版也行
```

**第三步：启用 Chrome MCP**

1. 在 REPL 中输入 `/mcp` 打开 MCP 面板
2. 找到 `mcp-chrome`，按空格键启用
3. 按 Enter 确认

### 方案二：Claude in Chrome

**前置条件**

| 条件 | 说明 |
|------|------|
| Claude Code 订阅 | 需要 Claude Pro、Max 或 Team 订阅，浏览器插件功能不向免费用户开放 |
| Chrome 浏览器 | 需已安装 Google Chrome |
| Claude in Chrome 扩展 | 从 Chrome Web Store 安装（`claude.ai/chrome`） |
| Claude Code CLI | 已通过 `bun run dev` 或构建产物运行 |

**启动 CLI**

```bash
# Dev 模式
bun run dev -- --chrome

# 构建产物
node dist/cli.js --chrome
```

启动后 Claude 会自动检测 Chrome 扩展是否已安装，并注册浏览器控制工具。

**确认连接**：REPL 中输入 `/chrome`，查看扩展状态是否显示 "Installed / Connected"。

**开始对话**：正常与 Claude 对话，当需要操作浏览器时直接说，例如：

- "打开 https://example.com 并截图"
- "在当前页面搜索关键词 xxx"
- "填写登录表单，用户名 admin"
- "帮我录制当前操作的 GIF"

**权限审批**：首次执行浏览器操作时，Claude 会请求你的确认；操作完成后返回结果（截图、文本、执行结果等）。

## 详细说明：Chrome Use MCP

Chrome Use MCP 是基于社区开源项目 [`mcp-chrome`](https://github.com/hangwin/mcp-chrome) 的自托管方案。Claude Code 以标准 MCP 客户端身份接入，由扩展提供浏览器侧能力。

特点：

- 完全开源、可自托管，不依赖 Anthropic 账户体系
- 在 MCP 面板里启用/禁用，不占用启动参数
- 能力由扩展决定，适合做定制化浏览器自动化

相关文档：

- GitHub 仓库：https://github.com/hangwin/mcp-chrome

## 详细说明：Claude in Chrome

Claude in Chrome 是 Anthropic 官方扩展 + 内建工具集，提供更完整的浏览器操控能力。

### 可用操作

#### 页面交互

| 操作 | 说明 |
|------|------|
| `navigate` | 导航到指定 URL，或前进/后退 |
| `computer` | 鼠标点击、移动、拖拽、键盘输入、截图等（13 种 action） |
| `form_input` | 填写表单字段 |
| `upload_image` | 上传图片到文件输入框或拖拽区域 |
| `javascript_tool` | 在页面上下文执行 JavaScript |

#### 页面读取

| 操作 | 说明 |
|------|------|
| `read_page` | 获取页面可访问性树（DOM 结构） |
| `get_page_text` | 提取页面纯文本内容 |
| `find` | 用自然语言搜索页面元素 |

#### 标签页管理

| 操作 | 说明 |
|------|------|
| `tabs_context_mcp` | 获取当前标签组信息 |
| `tabs_create_mcp` | 创建新标签页 |

#### 监控与调试

| 操作 | 说明 |
|------|------|
| `read_console_messages` | 读取浏览器控制台日志 |
| `read_network_requests` | 读取网络请求记录 |

#### 其他

| 操作 | 说明 |
|------|------|
| `resize_window` | 调整浏览器窗口尺寸 |
| `gif_creator` | 录制 GIF 并导出 |
| `shortcuts_list` | 列出可用快捷方式 |
| `shortcuts_execute` | 执行快捷方式 |
| `update_plan` | 向你提交操作计划供审批 |
| `switch_browser` | 切换到其他 Chrome 浏览器（仅 Bridge 模式） |

### 通信模式

Claude in Chrome 支持两种与浏览器通信的方式：

**本地 Socket（默认）**：Chrome 扩展通过 Native Messaging Host 与 CLI 建立 Unix socket 连接。适用于本地开发，无需额外配置。

**Bridge WebSocket**：通过 Anthropic 的 bridge 服务中转，支持远程操控浏览器。需要 claude.ai OAuth 登录。

## 进阶与参考

### 配置

#### 启用 / 禁用（Claude in Chrome）

```bash
# 显式禁用
bun run dev -- --no-chrome
```

或在 REPL 中通过 `/chrome` 命令切换启用/禁用状态。

#### 通过配置默认启用

在 Claude Code 设置中将 `claudeInChromeDefaultEnabled` 设为 `true`，以后启动无需加 `--chrome` 参数。

#### Feature Flag 提示

- Chrome Use MCP：依赖标准 MCP 加载机制，通过 `/mcp` 面板启用。
- Claude in Chrome：构建/运行时通过 `--chrome` 参数（对应内部 feature 开关）加载浏览器相关模块；不带该参数启动时不会加载任何浏览器相关模块，不影响其他功能。

### 常见问题

**扩展显示未安装**

确认已从 Chrome Web Store 安装 "Claude in Chrome" 扩展，安装后重启浏览器。Chrome Use MCP 用户则需确认已按上面"加载已解压的扩展程序"步骤加载本地扩展。

**工具未出现在工具列表**

- Claude in Chrome：检查启动时是否加了 `--chrome` 参数，或通过 `/chrome` 命令确认状态。
- Chrome Use MCP：在 `/mcp` 面板里确认 `mcp-chrome` 已启用。

**连接超时**

确保 Chrome 浏览器正在运行且扩展已启用。Native Messaging Host 在扩展安装时自动注册，如果重装过扩展需要重启浏览器。

**不使用 Chrome 功能时**

不带 `--chrome` 参数正常启动即可，不会加载任何浏览器相关模块，不影响其他功能。
