# Claude Code Best 文档大纲

> 自动生成自 docs.json 与各文档 frontmatter。共 3 个顶级分组。

## 1. 开始

- `getting-started/installation` — **安装 Claude Code Best** — 通过 NPM 一行命令安装 CCB，或从源码克隆构建。支持 macOS、Linux、Windows。
- `getting-started/quickstart` — **快速上手** — 5 分钟掌握 CCB 的基本使用：启动会话、输入指令、审批工具调用、用斜杠命令管理状态。
- `getting-started/model-providers` — **配置模型供应商** — 通过 /login 命令接入 OpenAI / Anthropic / Gemini / Grok 兼容协议，或直接用环境变量配置。支持 DeepSeek、GLM、OpenRouter、Bedrock 代理等任意兼容服务。

## 2. 核心功能

- ### 协作与多 Agent
  - `features/agents/pipes-and-lan` — **群控：本机 + 局域网多实例协作** — 多台 CCB 实例零配置组网，同机用 UDS、跨机用 LAN，自动发现与消息路由。包含 /pipes 命令、心跳机制、消息路由详解。
  - `features/agents/acp` — **ACP 协议：接入 Zed / Cursor 等 IDE** — 通过 ACP（Agent Client Protocol）把 CCB 接入支持 ACP 的 IDE。本文包含 acp-link CLI 用法、权限桥接、以及 Zed 集成案例。
- ### 外部接入
  - `features/external/channels` — **频道消息推送（Channels）** — MCP 服务器把飞书 / Slack / Discord / 微信等外部消息推到会话，`--channels plugin:name@marketplace` 启用。
  - `features/external/chrome-control` — **Chrome 浏览器控制** — 让 AI 用自然语言操作 Chrome 浏览器：导航、表单、数据抓取。两种实现方案对比：自托管 MCP（chrome-use-mcp）与 Chrome 原生集成（claude-in-chrome-mcp）。
  - `features/external/computer-use` — **屏幕控制（Computer Use）** — 截屏、键鼠控制，跨 macOS / Windows / Linux。本文包含快速上手、平台差异说明和工具参考。
  - `features/external/voice-mode` — **语音输入（Voice Mode）** — Push-to-talk 语音输入，支持豆包语言模型。需 Anthropic OAuth 或本地语音后端。
  - `features/external/web-browser-tool` — **浏览器操作工具** — 让 AI 控制 Chrome 完成网页操作：导航、点击、输入、抓取。
- ### 运行模式
  - `features/modes/auto-dream` — **后台记忆整理（Auto Dream）** — 会话间自动审查、组织和修剪持久化记忆，确保未来会话快速获得准确上下文。
  - `features/modes/remote-control-self-hosting` — **Remote Control 私有化部署** — Docker 自托管 RCS，含 Web UI 控制面板、ACP agent 接入、JWT 认证。
- ### 工具与体验
  - `features/tools/langfuse-monitoring` — **Langfuse 监控集成** — Agent loop 实时监控，可视化每次 API 调用、token 消耗、工具执行链路，可一键转化为训练数据集。

## 3. 内部机制

- `internals/growthbook-adapter` — **GrowthBook 适配器 - 自定义 Feature Flag 服务器接入** — 通过环境变量连接自定义 GrowthBook 服务器，实现远程 feature flag 控制。无配置时自动回退到代码默认值。
- `internals/sentry-setup` — **自定义 Sentry 错误上报配置** — 通过环境变量连接自托管或 Cloud Sentry，实现 CLI 运行时的错误捕获与上报。不配置则完全静默。

