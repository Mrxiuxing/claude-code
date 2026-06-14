---
title: "ACP 协议：接入 Zed / Cursor 等 IDE"
description: "通过 ACP（Agent Client Protocol）把 CCB 接入支持 ACP 的 IDE。本文包含 acp-link CLI 用法、权限桥接、以及 Zed 集成案例。"
keywords: ["ACP 协议", "Zed 编辑器", "acp-link", "权限桥接", "IDE 集成"]
---

# ACP 协议：接入 Zed / Cursor 等 IDE

## 概述

ACP (Agent Client Protocol) 是一种标准化的 stdio 协议，允许 IDE 和编辑器通过 stdin/stdout 的 NDJSON 流驱动 AI Agent。CCB 实现了完整的 ACP agent 端，可以被 Zed、Cursor 等支持 ACP 的客户端直接调用。

CCB 在 ACP 体系下提供两层能力：

- **ACP Agent**（源码目录 `src/services/acp/`）：CCB 自身作为 ACP agent，通过 `ccb --acp` 暴露 stdio 接口，由 IDE 直接调用。
- **acp-link 代理服务器**（源码目录 `packages/acp-link/`）：将 WebSocket 客户端桥接到 ACP agent 的 stdio 接口，让 ACP agent 可以通过 WebSocket 远程访问，而不仅限于本地 stdio。

### 核心特性

ACP Agent：

- **会话管理**：新建 / 恢复 / 加载 / 分叉 / 关闭会话
- **历史回放**：恢复会话时自动加载并回放对话历史
- **权限桥接**：ACP 客户端的权限决策映射到 CCB 的工具权限系统
- **斜杠命令 & Skills**：加载真实命令列表，支持 `/commit`、`/review` 等 prompt 型 skill
- **Context Window 跟踪**：精确的 usage_update，含 model prefix matching
- **Prompt 排队**：支持连续发送多条 prompt，自动排队处理
- **模式切换**：auto / default / acceptEdits / plan / dontAsk / bypassPermissions
- **模型切换**：运行时切换 AI 模型

acp-link：

- **WebSocket → stdio 桥接**：将浏览器/远程客户端的 WebSocket 连接转换为 ACP agent 的 stdin/stdout NDJSON 流
- **会话管理**：创建、加载、恢复、列出、关闭会话
- **权限审批流程**：客户端可远程审批 agent 的工具权限请求
- **RCS 集成**：可与 Remote Control Server (RCS) 连接，将 ACP agent 注册到 RCS 并通过 Web UI 交互
- **HTTPS 支持**：内置自签名证书生成，支持安全连接
- **Token 认证**：自动生成或通过环境变量配置认证 token

## 快速上手

### 在 Zed 中接入 CCB

1. 打开 Zed 的 `settings.json`（`Cmd+,` → Open Settings），添加 `agent_servers` 配置：

   ```json
   {
     "agent_servers": {
       "ccb": {
         "type": "custom",
         "command": "ccb",
         "args": ["--acp"]
       }
     }
   }
   ```

2. API 认证：CCB 的 ACP agent 在启动时会自动加载 `settings.json` 中的环境变量（`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN` 等）。确保已通过 `/login` 配置好 API 供应商；也可在 `agent_servers` 中显式传入 `env`：

   ```json
   {
     "agent_servers": {
       "claude-code": {
         "command": "ccb",
         "args": ["--acp"],
         "env": {
           "ANTHROPIC_BASE_URL": "https://api.example.com/v1",
           "ANTHROPIC_AUTH_TOKEN": "sk-xxx"
         }
       }
     }
   }
   ```

3. 重启 Zed，打开任意项目目录。
4. 按 `Cmd+'`（macOS）或 `Ctrl+'`（Linux）打开 Agent Panel。
5. 在 Agent Panel 顶部的下拉菜单中选择 **claude-code**。
6. 开始对话。

### Zed 中的功能操作

| 功能 | 操作 |
|------|------|
| 对话 | 在 Agent Panel 中直接输入消息 |
| 斜杠命令 | 输入 `/` 查看可用 skills 列表（如 `/commit`、`/review`） |
| 工具权限 | 弹出权限请求时选择 Allow / Reject / Always Allow |
| 模式切换 | 通过 Agent Panel 的设置菜单切换 auto/default/plan 等模式 |
| 模型切换 | 通过 Agent Panel 的设置菜单切换 AI 模型 |
| 会话恢复 | 关闭重开 Zed 后，之前的会话可自动恢复（含历史消息） |

### 通过 acp-link 暴露到网络

```bash
# 直接运行（在 monorepo 中）
# 注意：claude 本身不支持 ACP，需要用 ccb-bun --acp 启动 ACP agent
bun packages/acp-link/src/cli/bin.ts ccb-bun -- --acp

# 指定端口和主机
acp-link --port 9000 --host 0.0.0.0 ccb-bun -- --acp

# 启用 HTTPS（自签名证书）
acp-link --https ccb-bun -- --acp

# 调试模式
acp-link --debug ccb-bun -- --acp
```

## 详细说明

### ACP Agent 架构

```
┌──────────────┐    NDJSON/stdio    ┌──────────────────┐
│  Zed / IDE   │ ◄────────────────► │  CCB ACP Agent   │
│  (Client)    │   stdin / stdout   │  (Agent)         │
└──────────────┘                    │                  │
                                    │  entry.ts        │ ← stdio → NDJSON stream
                                    │  agent.ts        │ ← ACP protocol handler
                                    │  bridge.ts       │ ← SDKMessage → ACP SessionUpdate
                                    │  permissions.ts  │ ← 权限桥接
                                    │  utils.ts        │ ← 通用工具
                                    │                  │
                                    │  QueryEngine     │ ← 内部查询引擎
                                    └──────────────────┘
```

| 文件 | 职责 |
|------|------|
| `entry.ts` | 入口，创建 stdio → NDJSON stream，启动 `AgentSideConnection` |
| `agent.ts` | 实现 ACP `Agent` 接口：会话 CRUD、prompt、cancel、模式/模型切换 |
| `bridge.ts` | `SDKMessage` → ACP `SessionUpdate` 转换：文本/思考/工具/用量/编辑 diff |
| `permissions.ts` | ACP `requestPermission()` → CCB `CanUseToolFn` 桥接 |
| `utils.ts` | Pushable、流转换、权限模式解析、session fingerprint、路径显示 |

### acp-link 架构

#### 独立模式

```
┌──────────────────┐    WebSocket     ┌──────────────────┐    stdio/NDJSON    ┌──────────────┐
│  浏览器/客户端     │ ◄──────────────►│  acp-link        │ ◄────────────────►│  ACP Agent   │
│  (WS Client)     │  ws://host:port  │  (Proxy Server)  │  spawn subprocess │  (Claude等)   │
└──────────────────┘                  └──────────────────┘                    └──────────────┘
```

#### RCS 集成模式

```
┌──────────────┐    WebSocket     ┌──────────────────┐    stdio/NDJSON    ┌──────────────┐
│  RCS Web UI  │ ◄──────────────►│  Remote Control  │ ◄─────────────────►│  acp-link    │
│  (/code/*)   │  ACP Relay WS   │  Server (RCS)    │  ACP events        │  + Agent     │
└──────────────┘                  └──────────────────┘                    └──────────────┘
```

#### 文件结构

```
packages/acp-link/
├── src/
│   ├── server.ts        # 主服务器：WS 连接管理、会话管理、权限处理、消息桥接
│   ├── rcs-upstream.ts  # RCS 上游客户端：REST 注册 + WS identify 两步流程
│   ├── cert.ts          # TLS 证书生成（自签名）
│   ├── logger.ts        # 日志模块
│   ├── types.ts         # JSON-RPC 和 ACP 协议类型定义
│   ├── cli/
│   │   ├── bin.ts       # CLI 入口
│   │   ├── command.ts   # 命令行参数解析
│   │   ├── app.ts       # 应用启动
│   │   └── context.ts   # 上下文配置
│   └── __tests__/       # 测试（cert, server, types）
├── package.json
└── tsconfig.json
```

### acp-link CLI 参考

```
USAGE
  acp-link [--port value] [--host value] [--debug] [--no-auth] [--https] <command>...
  acp-link --help
  acp-link --version

FLAGS
       [--port]     Port to listen on                  [default = 9315]
       [--host]     Host to bind to                    [default = localhost]
       [--debug]    Enable debug logging to file
       [--no-auth]  Disable authentication (dangerous)
       [--https]    Enable HTTPS with self-signed cert
    -h  --help      Print help information and exit
    -v  --version   Print version information and exit

ARGUMENTS
  command...  Agent command followed by its arguments (e.g. "ccb-bun -- --acp")
```

### 接入其他 ACP 客户端

ACP 是开放协议，任何支持 ACP 的客户端都可以连接 CCB。通用配置模式：

```
命令: ccb --acp
参数: ["--acp"]
通信: stdin/stdout NDJSON
协议版本: ACP v1
```

#### Cursor

在 Cursor 的设置中配置 MCP / Agent Server，使用同样的 `ccb --acp` 命令。

#### 自定义客户端

使用 `@agentclientprotocol/sdk` 可以快速构建 ACP 客户端：

```typescript
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'

// 创建连接（将 ccb --acp 作为子进程启动）
const child = spawn('ccb', ['--acp'])
const stream = ndJsonStream(
  Writable.toWeb(child.stdin),
  Readable.toWeb(child.stdout),
)

const client = new ClientSideConnection(stream)

// 初始化
await client.initialize({ clientCapabilities: {} })

// 创建会话
const { sessionId } = await client.newSession({
  cwd: '/path/to/project',
})

// 发送 prompt
const response = await client.prompt({
  sessionId,
  prompt: [{ type: 'text', text: 'Hello, explain this project' }],
})

// 监听 session 更新
client.on('sessionUpdate', (update) => {
  console.log('Update:', update)
})
```

## 进阶与参考

### 认证

默认启动时 acp-link 自动生成随机 token。客户端连接时不要把 token 放在 URL 中：

```
ws://localhost:9315/ws
```

无法发送 `Authorization` header 的 WebSocket 客户端需要使用
`rcs.auth.<base64url-token>` 子协议传递 token。

配置固定 token：

```bash
ACP_AUTH_TOKEN=my-fixed-token acp-link ccb-bun -- --acp
```

禁用认证（不推荐，仅用于开发）：

```bash
acp-link --no-auth ccb-bun -- --acp
```

### RCS 集成

acp-link 支持将 ACP agent 注册到 Remote Control Server，通过 Web UI 远程操控。

```bash
# 通过环境变量配置 RCS 连接
ACP_RCS_URL=http://localhost:3000 \
ACP_RCS_TOKEN=sk-rcs-your-key \
acp-link ccb-bun -- --acp
```

注册流程（两步）：

1. **REST 注册**：通过 `POST /v1/environments/bridge` 向 RCS 注册环境
2. **WS identify**：建立 WebSocket 连接后发送 `identify` 消息（携带 agentId），替代完整 `register`

RCS 的 ACP WebSocket 连接不接受 URL query token。acp-link 会通过
`rcs.auth.<base64url-token>` WebSocket 子协议发送 `ACP_RCS_TOKEN`。

```
acp-link                          RCS
   │                                │
   │── POST /v1/environments/bridge ──►│  (REST 注册)
   │◄── { agentId, sessionId } ───────│
   │                                │
   │── WS connect ─────────────────►│  (WebSocket)
   │── identify { agentId } ────────►│  (WS 标识)
   │◄── identified ─────────────────│
   │                                │
   │── ACP events ─────────────────►│  (双向消息转发)
   │◄── user prompts/permissions ───│
```

### 权限模式

#### permissionMode 传递链

权限模式通过整条链路传递：Web UI → RCS → acp-link → ACP agent。

支持的权限模式：

- `default` — 每次请求权限确认
- `auto` — 自动判断
- `acceptEdits` — 自动接受编辑
- `plan` — 规划模式
- `dontAsk` — 不询问
- `bypassPermissions` — 绕过权限（需 sandbox 环境）

#### fallback 链

当客户端未显式传递 permissionMode 时，使用以下 fallback 链：

```
客户端传值 > config.permissionMode > ACP_PERMISSION_MODE 环境变量
```

示例：

```bash
ACP_PERMISSION_MODE=auto acp-link ccb-bun -- --acp
```

#### 权限管道改进

- **模式同步**：`applySessionMode` 在 agent 切换权限模式时同步 `appState.toolPermissionContext.mode`，确保内部权限上下文与 ACP 客户端状态一致。
- **统一权限流水线**：`createAcpCanUseTool` 接入 `hasPermissionsToUseTool` 统一权限流水线，替代原来分散的处理逻辑。支持 `onModeChange` 回调，模式变更时实时同步。
- **bypass 检测**：`bypassPermissions` 模式增加可用性检测 — 仅在非 root 或 sandbox 环境中允许启用，防止权限绕过的安全风险。

### ACP 协议支持矩阵

| 方法 | 状态 | 说明 |
|------|------|------|
| `initialize` | 支持 | 返回 agent 信息和能力 |
| `authenticate` | 支持 | 无需认证（自托管） |
| `newSession` | 支持 | 创建新会话 |
| `resumeSession` | 支持 | 恢复已有会话（含历史回放） |
| `loadSession` | 支持 | 加载指定会话（含历史回放） |
| `listSessions` | 支持 | 列出可用会话 |
| `forkSession` | 支持 | 分叉会话 |
| `closeSession` | 支持 | 关闭会话 |
| `prompt` | 支持 | 发送消息，支持排队 |
| `cancel` | 支持 | 取消当前/排队的 prompt |
| `setSessionMode` | 支持 | 切换权限模式 |
| `setSessionModel` | 支持 | 切换 AI 模型 |
| `setSessionConfigOption` | 支持 | 动态修改配置 |

#### SessionUpdate 类型

| 类型 | 状态 | 说明 |
|------|------|------|
| `agent_message_chunk` | 支持 | 助手文本消息 |
| `agent_thought_chunk` | 支持 | 思考/推理内容 |
| `user_message_chunk` | 支持 | 用户消息（历史回放） |
| `tool_call` | 支持 | 工具调用开始 |
| `tool_call_update` | 支持 | 工具调用结果/状态更新 |
| `usage_update` | 支持 | token 用量 + context window |
| `plan` | 支持 | TodoWrite → plan entries |
| `available_commands_update` | 支持 | 斜杠命令 & skills 列表 |
| `current_mode_update` | 支持 | 模式切换通知 |
| `config_option_update` | 支持 | 配置更新通知 |

### 环境变量与功能开关

#### 环境变量

| 变量 | 说明 |
|------|------|
| `ACP_AUTH_TOKEN` | 固定认证 token（默认自动生成） |
| `ACP_PERMISSION_MODE` | 默认权限模式 fallback |
| `ACP_RCS_URL` | RCS 服务器地址（启用 RCS 集成） |
| `ACP_RCS_TOKEN` | RCS API token |

#### 功能开关

ACP Agent 与 acp-link 受 `FEATURE_ACP` 控制，build 和 dev 模式默认启用。源码目录：

- ACP Agent：`src/services/acp/`
- acp-link：`packages/acp-link/`（相关 PR：#292，新增时间：2026-04-18）
