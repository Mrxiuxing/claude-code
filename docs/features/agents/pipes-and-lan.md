---
title: "群控：本机 + 局域网多实例协作"
description: "多台 CCB 实例零配置组网，同机用 UDS、跨机用 LAN，自动发现与消息路由。包含 /pipes 命令、心跳机制、消息路由详解。"
keywords: ["群控", "局域网协作", "UDS", "多实例", "消息路由"]
---

# 群控：本机 + 局域网多实例协作

## 概述

Pipes 系统提供 Claude Code CLI 实例之间的通讯能力，让你可以在一台机器（main）上操控其他实例（sub），发送 prompt、查看执行结果、审批权限请求——全程零配置。

系统分两层，使用同一套协议（NDJSON）和同一套命令（`/pipes`、`/attach`、`/send` 等），对用户完全透明：

1. **本机 Pipes（UDS）**：同一台机器上的多个 CLI 实例通过 Unix Domain Socket（Linux/macOS）或 Windows Named Pipe 协作
2. **局域网 Pipes（LAN）**：不同机器上的 CLI 实例通过 TCP + UDP Multicast beacon 协作

> 严格区分：`/peers` 解决"找到其他会话并发消息"（通用消息投递），`/pipes` 解决"把一个 REPL 变成另一个 REPL 的受控 worker"（主从 REPL 协调平面）。两者职责不同，不要混淆。

### 两层职责拆解

| 层 | 面向 | 传输方式 | 对外入口 |
|------|------|----------|----------|
| UDS peer messaging | 任意 CCB 进程 | 本机 Unix socket / Named pipe | `/peers`、`SendMessageTool` 的 `uds:<socket-path>` |
| pipes control plane | 交互式 REPL 会话间的主从协作 | 本机 socket + LAN TCP | `/pipes`、`/attach`、`/detach`、`/send`、`/pipe-status`、`/claim-main` |

两层都依赖本机 socket，但命名、角色模型、交互语义和 UI 集成都不同：peer 层按 socket 路径寻址，服务工具调用；pipes 层按 `cli-xxxxxxxx` 会话名和 `main/sub/master/slave` 角色工作，直接影响 REPL 提交路径和 PromptInput 页脚。

## 快速上手

### 场景一：本机多实例

```bash
# 终端 1
bun run dev
# 启动后自动注册为 main

# 终端 2
bun run dev
# 自动注册为 sub-1，被 main 自动 attach
```

在终端 1 中输入 `/pipes`，可以看到两个实例。选中 sub-1 后，输入的消息会自动转发到 sub-1 执行。

### 场景二：局域网多机器

前置条件：

- 两台或以上机器在同一局域网
- 每台机器安装了 CCB 并能 `bun run dev`
- 防火墙允许 UDP 7101 + TCP 动态端口（见下方配置）

```bash
# 机器 A (192.168.50.22)
bun run dev

# 机器 B (192.168.50.27)
bun run dev
```

两边启动后等 3-5 秒（beacon 广播间隔），LAN peers 会自动发现并 attach。输入 `/pipes` 可看到标记 `[LAN]` 的远端实例。

## 防火墙配置

**每台机器都需要执行。** 请先确认网络为局域网（非公共 WiFi），路由器未开启 AP 隔离，两台机器在同一子网（`ping` 能通）。

### Windows（管理员 PowerShell）

```powershell
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon (UDP)" -Direction Inbound -Protocol UDP -LocalPort 7101 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Pipes (TCP)" -Direction Inbound -Protocol TCP -LocalPort 1024-65535 -Program (Get-Command bun).Source -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Claude Code LAN Beacon Out (UDP)" -Direction Outbound -Protocol UDP -RemotePort 7101 -Action Allow -Profile Private
# 确认网络为"专用"：Get-NetConnectionProfile
```

### macOS

首次运行时系统弹出"允许接受传入连接"对话框，点击"允许"即可。如果使用 pf 防火墙：

```bash
echo "pass in proto udp from any to any port 7101" | sudo pfctl -ef -
```

### Linux（firewalld / iptables）

```bash
# firewalld
sudo firewall-cmd --zone=trusted --add-port=7101/udp --permanent
sudo firewall-cmd --zone=trusted --add-port=1024-65535/tcp --permanent
sudo firewall-cmd --reload

# 或 iptables
sudo iptables -A INPUT -p udp --dport 7101 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 1024:65535 -m owner --uid-owner $(id -u) -j ACCEPT
```

## 交互面板与快捷键

### 状态栏

执行 `/pipes` 后，输入框底部出现 pipe 状态栏（单行），始终可见（直到会话结束）：

```
pipe: cli-a91bad56 (main) 192.168.50.22  2/3 selected  selected pipes only · ←/→ or m switch · Shift+↓ edit
```

显示：当前 pipe 名、角色、IP、已选数/总数、路由模式。

### 展开选择面板

按 **Shift+↓**（Shift + 下箭头）展开选择面板：

```
pipe: cli-a91bad56 (main) 192.168.50.22  ↑↓ move Space select ←/→ or m route Enter/Esc close Shift+↓ toggle
  当前普通 prompt 走 已选 sub；切换不会清空选择
  ☑ cli-da029538 (sub-1 XC/192.168.50.22)
  ☐ cli-04d67950 (main vmwin11/192.168.50.27)
  ☑ cli-893747d3 [offline] (sub-2 vmwin11/192.168.50.27)
```

### 面板快捷键

| 快捷键 | 场景 | 作用 |
|--------|------|------|
| **Shift+↓** | 状态栏可见时 | 展开/收起选择面板 |
| **↑ / ↓** | 面板展开时 | 上下移动光标 |
| **Space** | 面板展开时 | 切换当前光标所在 pipe 的选中状态（☑ ↔ ☐） |
| **Enter** | 面板展开时 | 确认并关闭面板 |
| **Esc** | 面板展开时 | 取消并关闭面板 |
| **← / → 或 M** | 状态栏可见且有选中 pipe 时 | 切换路由模式（`selected pipes only` ↔ `local main`） |

### 完整操作流程示例

```
1. 输入 /pipes                     → 状态栏出现，显示发现的实例
2. 按 Shift+↓                      → 展开选择面板
3. 按 ↓ 移动到目标 pipe             → 光标移到 cli-04d67950
4. 按 Space                        → 选中 ☑ cli-04d67950
5. 按 Enter                        → 确认，面板收起
6. 输入 "帮我检查 git status"       → prompt 自动发送到 cli-04d67950 执行
7. 按 M                            → 切换到 local main 模式
8. 输入 "本地做点什么"              → 仅在本地执行
9. 按 M                            → 切回 selected pipes only
10. 输入 "继续远端任务"             → 又发送到 cli-04d67950
```

远端执行结果会流式回传到你的消息列表：

```
[main vmwin11/192.168.50.27 / cli-04d67950] 正在检查 git status...
[main vmwin11/192.168.50.27 / cli-04d67950] Completed
```

## 消息路由

### 路由模式

通过 **M 键**（或 ← / →）切换，**无需展开面板**。切换路由模式**不会清空选择**——你可以在 `local main` 模式下保持选择，随时按 M 切回继续向远端发送。

| 模式 | 状态栏显示 | 行为 |
|------|-----------|------|
| `selected pipes only` | 绿色高亮 | 输入的 prompt **仅**发送到选中的 pipe，本地不执行 |
| `local main` | 灰色 | 输入的 prompt 在**本地 main** 执行，不转发到任何 pipe |

### 选中 pipe 后的自动路由

1. 通过 `/pipes select` 或 Shift+↓ 面板选中一个或多个 pipe
2. 在输入框中正常输入消息
3. 消息自动发送到所有选中的**已连接** pipe
4. 每个 pipe 独立执行，结果流式回传到 main 的消息列表

> 选中但未连接的 pipe 不会导致本地处理被错误跳过——只有已连接的 pipe 会收到广播。

## 命令参考

### /pipes

显示所有发现的实例，管理选择状态。再次执行 `/pipes` 切换面板展开/收起。

```
/pipes                    — 显示所有实例 + 切换选择面板
/pipes select <name>      — 选中某实例（消息会广播到它）
/pipes deselect <name>    — 取消选中
/pipes all                — 全选
/pipes none               — 全部取消
```

输出示例：

```
Your pipe:   cli-a91bad56
Role:        main
Machine ID:  205d6c3a...
IP:          192.168.50.22
Host:        XC

Main machine: 205d6c3a... (this machine)
  [main] cli-a91bad56  XC/192.168.50.22  [alive] (you)
  ☑ [sub-1] cli-da029538  XC/192.168.50.22  [alive] [connected]

LAN Peers:
  ☐ [main] cli-04d67950  vmwin11/192.168.50.27  tcp:192.168.50.27:58853  [LAN]

Selected: cli-da029538
```

### 其他命令

| 命令 | 说明 |
|------|------|
| `/attach <name>` | 手动 attach 到一个实例（自动识别 LAN peer 并通过 TCP 连接），使其成为 slave |
| `/detach <name>` | 断开与某个 slave 的连接 |
| `/send <name> <msg>` | 向指定 pipe 发送消息（不依赖选择状态，直接指定目标） |
| `/send tcp:host:port <msg>` | 直接通过 TCP 地址发送 |
| `/claim-main` | 强制声明当前机器为 main（用于 main 意外退出后的恢复） |
| `/pipe-status` | 显示详细状态 |
| `/peers` | 列出所有已发现的 peer |

通常不需要手动 attach——heartbeat 会自动发现并连接。attach 后对方变为 slave，你变为 master，可以向它发送 prompt。

示例：

```
/attach cli-04d67950
/send cli-04d67950 请帮我检查一下日志
/send tcp:192.168.50.27:58853 hello
```

## 权限转发

当远端 slave 执行需要权限的工具（如 BashTool）时：

1. slave 发送 `permission_request` 到 main
2. main 弹出权限确认对话框，显示来源标记 `[role hostname/ip / pipeName]`
3. 用户确认/拒绝
4. 结果发回 slave，继续或中断

> AI 通过 `SendMessageTool` 发送 `tcp:` 消息时需用户显式确认。

## 架构详解

### 通信协议

所有通讯使用 NDJSON（Newline-Delimited JSON），每行一个消息：

```json
{"type":"ping","from":"cli-abc","ts":"2026-04-11T00:00:00.000Z"}
{"type":"prompt","data":"帮我查看 git status","from":"cli-abc","ts":"..."}
{"type":"stream","data":"正在执行...","from":"cli-def","ts":"..."}
{"type":"done","data":"","from":"cli-def","ts":"..."}
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `ping`/`pong` | 双向 | 健康检查 |
| `attach_request`/`accept`/`reject` | M→S/S→M | 连接控制 |
| `detach` | M→S | 断开连接 |
| `prompt` | M→S | 主向从发送 prompt |
| `prompt_ack` | S→M | 从确认接收 |
| `stream` | S→M | 从流式回传 AI 输出 |
| `tool_start`/`tool_result` | S→M | 工具执行通知 |
| `done` | S→M | 本轮完成 |
| `error` | 双向 | 错误通知 |
| `permission_request`/`response`/`cancel` | 双向 | 权限审批转发 |

### 传输层

```
              本机                          LAN
        ┌──────────────┐            ┌──────────────┐
        │  PipeServer  │            │  PipeServer  │
        │   UDS sock   │            │   UDS sock   │
        │   TCP :rand  │◄───TCP───►│   TCP :rand  │
        ├──────────────┤            ├──────────────┤
        │  LanBeacon   │◄──UDP────►│  LanBeacon   │
        │  224.0.71.67 │  mcast     │  224.0.71.67 │
        └──────────────┘            └──────────────┘
```

- **UDS / Named Pipe**：本机实例间通讯，通过文件系统路径寻址（`~/.claude/pipes/cli-xxx.sock`）
- **TCP**：LAN 实例间通讯，动态端口，通过 beacon 发现
- **UDP Multicast**：peer 发现，组地址 `224.0.71.67`，端口 `7101`，TTL=1（不跨路由器），3 秒广播一次 announce 包

### 角色模型

| 角色 | 说明 |
|------|------|
| `main` | 首个启动的实例，管理 registry |
| `sub` | 后续启动的同机实例（或被 attach 的 LAN 实例） |
| `master` | attach 了至少一个 slave 的实例 |
| `slave` | 被 master attach 控制的实例 |

**角色转换规则：**

- 首个启动 → `main`
- 同机后续启动 → `sub`（自动被 main attach → `slave`）
- LAN 发现 → 两边都是 `main`，heartbeat 自动互相 attach（跨机器 attach 时，两边都可以是 main——不要求对方必须是 sub）
- 被 attach → 变为 `slave`（可通过 `/detach` 恢复）

### 发现机制

**本机**：通过 `~/.claude/pipes/registry.json` 文件（带文件锁），`machineId` 绑定主机身份。同机 peer 层读取 `~/.claude/sessions/*.json`，按 `messagingSocketPath` 寻址。

**LAN**：通过 UDP multicast beacon：

1. 每台机器启动时创建 UDP multicast beacon，每 3 秒广播一次 `{ proto, pipeName, machineId, ip, tcpPort, role }`
2. 收到其他实例的 announce → 记入 peers Map
3. 15 秒未收到广播 → 标记 peer lost
4. Heartbeat 合并 local registry + beacon peers → 统一 attach 目标列表

### Heartbeat 循环（5 秒间隔）

**main/master 角色：**

1. `cleanupStaleEntries()` — 清理 registry 中死掉的条目
2. `getAliveSubs()` — 获取存活的本地 subs
3. `refreshDiscoveredPipes()` — 刷新 discoveredPipes（包含 LAN peers）
4. 合并 LAN peers 到 state
5. 构建统一 attach 目标列表 — 本地 subs + LAN peers
6. 遍历未连接的目标 → 自动 attach
7. 清理断开的 slave 连接 — 同时检查 local registry 和 beacon

**sub 角色：**

1. 检测 main 是否存活
2. main 死亡 → 同机则接管 main 角色，跨机则独立

### 当前 REPL 行为

当前线上行为由 `src/screens/REPL.tsx` 的内联实现负责（以该文件、`pipeTransport.ts`、`pipeRegistry.ts` 为事实来源）：

1. 启动时创建当前 REPL 的 pipe server
2. 通过 `pipeRegistry` 判定 `main` / `sub`
3. 处理 `attach_request` / `detach` / `prompt`
4. 主实例心跳探测并维护 `slaves`
5. `/pipes` 打开状态栏并维护选择器
6. 提交普通消息时，仅向**已连接**的 selected pipes 广播

过去的未接线 hook 方案已收敛，选中但未连接的 pipe 不会导致本地处理被错误跳过。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/utils/pipeTransport.ts` | PipeServer（双模 UDS+TCP）、PipeClient、类型定义 |
| `src/utils/lanBeacon.ts` | UDP multicast beacon、singleton 管理 |
| `src/utils/pipeRegistry.ts` | Registry CRUD、角色判定、machineId、LAN merge |
| `src/utils/peerAddress.ts` | 地址解析（uds:/bridge:/tcp: scheme） |
| `src/utils/udsMessaging.ts` | UDS peer messaging 服务端 |
| `src/utils/udsClient.ts` | UDS peer messaging 客户端 |
| `src/screens/REPL.tsx` | Bootstrap、heartbeat、cleanup、prompt 路由 |
| `src/hooks/useMasterMonitor.ts` | Slave client registry、消息订阅 |
| `src/hooks/useSlaveNotifications.ts` | Slave 端通知处理 |
| `src/commands/pipes/pipes.ts` | /pipes 命令 |
| `src/commands/attach/attach.ts` | /attach 命令 |
| `src/commands/send/send.ts` | /send 命令 |
| `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts` | AI 发消息工具（含 tcp: 支持） |

## 常见问题

### 看不到 LAN peer

1. 检查防火墙是否放行 UDP 7101
2. `Get-NetConnectionProfile`（Windows）确认网络为"专用"
3. 确认两台机器在同一子网（`ping` 能通）
4. 路由器未开启 AP 隔离

### 连接超时

1. 检查 TCP 入站防火墙规则
2. 确认没有 VPN 劫持流量
3. 尝试 `/send tcp:ip:port hello` 直接测试

### beacon 绑到了错误网卡

Windows 上 WSL/Docker 虚拟网卡可能劫持 multicast。beacon 会自动选择非内部 IPv4 接口。如果选错，检查 `getLocalIp()` 返回值。

## 配置

### Feature Flag

| Flag | 控制范围 | 默认 |
|------|----------|------|
| `UDS_INBOX` | 本机 Pipe IPC 全部功能（含 UDS peer messaging + pipes control plane） | dev/build 启用 |
| `LAN_PIPES` | 局域网 TCP + UDP beacon 扩展 | dev/build 启用 |

手动启用：

```bash
FEATURE_UDS_INBOX=1 FEATURE_LAN_PIPES=1 bun run dev
```

### 安全说明

- TCP 连接当前**无认证**——同 LAN 内知道端口号即可连接
- Multicast TTL=1，不跨路由器
- 建议仅在信任的局域网中使用

### 后续优化方向

**安全（P0）**

1. TCP 认证：首次连接时交换 HMAC-SHA256 token（基于 machineId + session secret）
2. JSON schema 验证：在所有 `JSON.parse` 入口点增加 Zod 校验，防 prototype pollution
3. Beacon 信息脱敏：hash machineId 后再广播

**可靠性（P1）**

4. 多网卡选择：`getLocalIp()` 应优先选择 RFC 1918 地址，排除 VPN/Docker 接口
5. TCP target 验证：`parseTcpTarget()` 应限制目标为已知 beacon peers 或 RFC 1918 范围
6. PipeServer close()：改为 `Promise.allSettled` 并行关闭 UDS + TCP，加 `_closing` guard

**功能（P2）**

7. mDNS/DNS-SD：作为 multicast 受限环境下的 beacon 替代方案
8. 固定端口配置：允许用户指定 TCP 端口范围，便于防火墙精确配置
9. TLS 加密：TCP 传输加密，防中间人窃听
10. 双向 prompt：当前只有 master → slave 方向，可考虑 slave 主动向 master 发送结果/请求
