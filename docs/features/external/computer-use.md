---
title: "屏幕控制（Computer Use）"
description: "截屏、键鼠控制，跨 macOS / Windows / Linux。本文包含快速上手、平台差异说明和工具参考。"
keywords: [屏幕控制, 截屏, 键鼠模拟, 跨平台自动化, Computer Use]
---

# 屏幕控制（Computer Use）

Computer Use 提供截屏、键鼠控制和应用管理能力，支持 macOS / Windows / Linux 三大桌面平台。Windows 平台额外提供窗口绑定模式（不干扰真实键鼠），全平台共 38 个工具。

本文包含三部分：

- **快速上手** — 启用方式与典型操作流程
- **平台差异说明** — 三平台的实现、依赖与能力差异
- **工具参考** — 全部工具的参数、用法和进阶场景

## 概述

Computer Use 由三个 workspace 包组成：

| 包 | 职责 |
|----|------|
| `@ant/computer-use-mcp` | MCP server 入口与工具注册（12 文件） |
| `@ant/computer-use-input` | 键鼠模拟（dispatcher + 各平台 backend） |
| `@ant/computer-use-swift` | 截图与应用管理（dispatcher + 各平台 backend） |

工具共 38 个，分三类：

| 分类 | 平台 | 工具数 | 说明 |
|------|------|--------|------|
| 通用工具 | 全平台 | 24 | 官方 Computer Use 标准能力 |
| Windows 专属工具 | Win32 | 11 | 绑定窗口模式下的增强能力 |
| 教学工具 | 全平台 | 3 | 分步引导模式（需 `teachMode` 开启） |

## 快速上手

### 启用方式

在启动 Claude Code 时附加 `--computer-use-mcp`，或在运行时通过 `feature("CHICAGO_MCP")` 控制入口初始化。

```bash
claude --computer-use-mcp
```

Linux 平台需要先安装依赖工具（详见下文「Linux 依赖工具」）。macOS / Windows 通常无需额外安装。

### 典型操作流程

#### 流程 1：全屏操作（未绑定窗口）

```
request_access(apps=["Notepad"])
open_application(app="Notepad")          ← 自动绑定窗口
screenshot                               ← PrintWindow 截图 + GUI 元素列表
left_click(coordinate=[500, 300])        ← 全局 SendInput
type(text="hello world")                 ← 全局 SendInput
key(text="ctrl+s")                       ← 全局 SendInput
```

#### 流程 2：绑定窗口操作（Windows 推荐，不干扰用户）

```
request_access(apps=["Notepad"])
bind_window(action="list")               ← 列出所有窗口
bind_window(action="bind", title="记事本") ← 绑定 + 绿色边框 + 虚拟光标
screenshot                               ← PrintWindow 截取绑定窗口
virtual_mouse(action="click", coordinate=[500, 300])   ← SendMessageW，不动真实鼠标
virtual_keyboard(action="type", text="hello world")    ← SendMessageW，不动物理键盘
virtual_keyboard(action="combo", text="ctrl+s")        ← 保存
mouse_wheel(coordinate=[500, 400], delta=-5)           ← 向下滚动
bind_window(action="unbind")             ← 解除绑定
```

#### 流程 3：按元素名称操作

```
bind_window(action="bind", title="记事本")
screenshot                               ← 返回截图 + GUI elements 列表
click_element(name="保存", role="Button") ← UI Automation 查找并点击
type_into_element(role="Edit", text="new content")
```

#### 流程 4：终端交互

```
bind_window(action="bind", title="PowerShell")
screenshot
prompt_respond(response_type="yes")      ← 回答 y + Enter
prompt_respond(response_type="select", arrow_direction="down", arrow_count=2)  ← 选第3项
```

#### 流程 5：Excel/浏览器滚动

```
bind_window(action="bind", title="Excel")
screenshot
mouse_wheel(coordinate=[600, 400], delta=-10)            ← 向下滚动 10 格
mouse_wheel(coordinate=[600, 400], delta=5, direction="horizontal")  ← 向右滚动
```

## 平台差异说明

### 各平台能力依赖

#### computer-use-input（键鼠）

| 功能 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 鼠标移动 | CGEvent JXA | SetCursorPos P/Invoke | xdotool mousemove |
| 鼠标点击 | CGEvent JXA | SendInput P/Invoke | xdotool click |
| 鼠标滚轮 | CGEvent JXA | SendInput MOUSEEVENTF_WHEEL | xdotool scroll |
| 键盘按键 | System Events osascript | keybd_event P/Invoke | xdotool key |
| 组合键 | System Events osascript | keybd_event 组合 | xdotool key combo |
| 文本输入 | System Events keystroke | SendKeys.SendWait | xdotool type |
| 前台应用 | System Events osascript | GetForegroundWindow P/Invoke | xdotool getactivewindow + /proc |
| 工具依赖 | osascript（内置） | powershell（内置） | xdotool（需安装） |

#### computer-use-swift（截图 + 应用管理）

| 功能 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 全屏截图 | screencapture | CopyFromScreen | gnome-screenshot / scrot / grim |
| 区域截图 | screencapture -R | CopyFromScreen(rect) | gnome-screenshot -a / scrot -a / grim -g |
| 显示器列表 | CGGetActiveDisplayList JXA | Screen.AllScreens | xrandr --query |
| 运行中应用 | System Events JXA | Get-Process | wmctrl -l / ps |
| 打开应用 | osascript activate | Start-Process | xdg-open / gtk-launch |
| 隐藏/显示 | System Events visibility | ShowWindow/SetForegroundWindow | wmctrl -c / xdotool |
| 工具依赖 | screencapture + osascript | powershell | xdotool + scrot/grim + wmctrl |

#### executor 层

| 功能 | macOS | Windows | Linux |
|------|-------|---------|-------|
| drainRunLoop | CFRunLoop pump | 不需要 | 不需要 |
| ESC 热键 | CGEventTap | 跳过（Ctrl+C fallback） | 跳过（Ctrl+C fallback） |
| 剪贴板读 | pbpaste | `powershell Get-Clipboard` | xclip -o / wl-paste |
| 剪贴板写 | pbcopy | `powershell Set-Clipboard` | xclip / wl-copy |
| 粘贴快捷键 | command+v | ctrl+v | ctrl+v |
| 终端检测 | __CFBundleIdentifier | WT_SESSION / TERM_PROGRAM | TERM_PROGRAM |
| 系统权限 | TCC check | 直接 granted | 检查 xdotool 安装 |

### Linux 依赖工具

| 工具 | 用途 | 安装命令（Ubuntu） |
|------|------|-------------------|
| `xdotool` | 键鼠模拟 + 窗口管理 | `sudo apt install xdotool` |
| `scrot` 或 `gnome-screenshot` | 截图 | `sudo apt install scrot` |
| `xrandr` | 显示器信息 | 通常已预装 |
| `xclip` | 剪贴板 | `sudo apt install xclip` |
| `wmctrl` | 窗口列表/切换 | `sudo apt install wmctrl` |

Wayland 环境需要替代工具：`ydotool`（替代 xdotool）、`grim`（替代 scrot）、`wl-clipboard`（替代 xclip）。初期可先只支持 X11，Wayland 标记为 todo。

## 工具参考

### 通用工具（24 个）

全平台可用。未绑定窗口时，操作对象是整个屏幕。

#### 权限与会话

| 工具 | 参数 | 说明 |
|------|------|------|
| `request_access` | `apps[]`, `reason`, `clipboardRead?`, `clipboardWrite?`, `systemKeyCombos?` | 请求操作应用的权限。所有其他工具的前置条件 |
| `list_granted_applications` | — | 列出当前会话已授权的应用 |

#### 截图与显示

| 工具 | 参数 | 说明 |
|------|------|------|
| `screenshot` | `save_to_disk?` | 截取当前屏幕。绑定窗口时截取绑定窗口（PrintWindow）。返回图片 + GUI 元素列表（Windows） |
| `zoom` | `region: [x1,y1,x2,y2]` | 截取指定区域的高分辨率图片。坐标基于最近一次全屏截图 |
| `switch_display` | `display` | 切换截图的目标显示器 |

#### 鼠标操作

| 工具 | 参数 | 说明 |
|------|------|------|
| `left_click` | `coordinate: [x,y]`, `text?` (修饰键) | 左键点击。`text` 可传 "shift"/"ctrl"/"alt" 实现组合点击 |
| `double_click` | `coordinate`, `text?` | 双击 |
| `triple_click` | `coordinate`, `text?` | 三击（选整行） |
| `right_click` | `coordinate`, `text?` | 右键点击 |
| `middle_click` | `coordinate`, `text?` | 中键点击 |
| `mouse_move` | `coordinate` | 移动鼠标（不点击） |
| `left_click_drag` | `coordinate` (终点), `start_coordinate?` (起点) | 拖拽 |
| `left_mouse_down` | — | 按下左键不松 |
| `left_mouse_up` | — | 松开左键 |
| `cursor_position` | — | 获取当前鼠标位置 |

#### 键盘操作

| 工具 | 参数 | 说明 |
|------|------|------|
| `type` | `text` | 输入文字 |
| `key` | `text` (如 "ctrl+s"), `repeat?` | 按键/组合键 |
| `hold_key` | `text`, `duration` (秒) | 按住键指定时长 |

#### 滚动

| 工具 | 参数 | 说明 |
|------|------|------|
| `scroll` | `coordinate`, `scroll_direction`, `scroll_amount` | 滚动。方向: up/down/left/right |

#### 应用管理

| 工具 | 参数 | 说明 |
|------|------|------|
| `open_application` | `app` | 打开应用。Windows 上自动绑定窗口 |

#### 剪贴板

| 工具 | 参数 | 说明 |
|------|------|------|
| `read_clipboard` | — | 读取剪贴板文字 |
| `write_clipboard` | `text` | 写入剪贴板 |

#### 其他

| 工具 | 参数 | 说明 |
|------|------|------|
| `wait` | `duration` (秒) | 等待 |
| `computer_batch` | `actions[]` | 批量执行多个动作（减少 API 往返） |

### Windows 专属工具（12 个）

仅 Windows 平台可见。核心能力：**绑定窗口后的独立操作——不抢占用户鼠标键盘**。

#### 工作模式

```
┌──────────────────────────────────────────────────┐
│                  未绑定模式                        │
│  使用通用工具 (left_click/type/key/scroll)          │
│  操作对象：整个屏幕                                 │
│  输入方式：全局 SendInput（会移动真实鼠标）           │
└──────────────────────────────────────────────────┘
                        │
                  bind_window / open_application
                        ▼
┌──────────────────────────────────────────────────┐
│                  绑定窗口模式                      │
│  使用 Win32 工具 (virtual_mouse/virtual_keyboard)  │
│  操作对象：绑定的窗口                               │
│  输入方式：SendMessageW（不动真实鼠标/键盘）          │
│  可视化：DWM 绿色边框 + 虚拟光标 + 状态指示器        │
└──────────────────────────────────────────────────┘
```

#### 窗口绑定

| 工具 | 参数 | 说明 |
|------|------|------|
| `bind_window` | `action`: list/bind/unbind/status | 窗口绑定管理 |

**动作详情：**

| action | 参数 | 说明 |
|--------|------|------|
| `list` | — | 列出所有可见窗口（hwnd、pid、title） |
| `bind` | `title?`, `hwnd?`, `pid?` | 绑定到指定窗口。设置 DWM 绿色边框 + 启动虚拟光标 + 启动状态指示器 + 短暂激活窗口确保可接收输入 |
| `unbind` | — | 解除绑定，恢复全屏模式 |
| `status` | — | 查看当前绑定状态（hwnd、title、pid、窗口矩形） |

#### 窗口管理

| 工具 | 参数 | 说明 |
|------|------|------|
| `window_management` | `action`, `x?`, `y?`, `width?`, `height?` | 窗口操作（Win32 API，不走全局快捷键） |

**动作详情：**

| action | 说明 |
|--------|------|
| `minimize` | ShowWindow(SW_MINIMIZE) |
| `maximize` | ShowWindow(SW_MAXIMIZE) |
| `restore` | ShowWindow(SW_RESTORE) — 恢复最小化/最大化 |
| `close` | SendMessage(WM_CLOSE) — 优雅关闭 |
| `focus` | SetForegroundWindow + BringWindowToTop — 激活窗口 |
| `move_offscreen` | SetWindowPos(-32000,-32000) — 移到屏幕外（仍可 SendMessage/PrintWindow） |
| `move_resize` | SetWindowPos — 移动/缩放到指定位置和大小 |
| `get_rect` | GetWindowRect — 获取当前位置和大小 |

#### 虚拟鼠标

| 工具 | 参数 | 说明 |
|------|------|------|
| `virtual_mouse` | `action`, `coordinate: [x,y]`, `start_coordinate?` | 在绑定窗口内操作虚拟鼠标 |

**动作详情：**

| action | 说明 |
|--------|------|
| `click` | 左键点击。虚拟光标移动到坐标 + 闪烁动画 |
| `double_click` | 双击 |
| `right_click` | 右键点击 |
| `move` | 移动虚拟光标（不点击） |
| `drag` | 按住 → 移动 → 松开。需 `start_coordinate` 指定起点 |
| `down` | 按下左键不松 |
| `up` | 松开左键 |

**与通用鼠标工具的区别：**

| | 通用 (`left_click` 等) | `virtual_mouse` |
|---|---|---|
| 输入方式 | SendInput（全局） | SendMessageW（窗口级） |
| 真实鼠标 | 会移动 | **不动** |
| 用户干扰 | 有 | **无** |
| 适用场景 | 未绑定时 | **绑定后** |

#### 虚拟键盘

| 工具 | 参数 | 说明 |
|------|------|------|
| `virtual_keyboard` | `action`, `text`, `duration?`, `repeat?` | 在绑定窗口内操作虚拟键盘 |

**动作详情：**

| action | text 含义 | 说明 |
|--------|----------|------|
| `type` | 要输入的文字 | SendMessageW(WM_CHAR)，支持 Unicode 中文/emoji |
| `combo` | 组合键 (如 "ctrl+s") | WM_KEYDOWN/UP 序列 |
| `press` | 单个键名 | 按下不松（配合 release 使用） |
| `release` | 单个键名 | 松开按键 |
| `hold` | 键名或组合 | 按住指定秒数后松开 |

**与通用键盘工具的区别：**

| | 通用 (`type`/`key`) | `virtual_keyboard` |
|---|---|---|
| 输入方式 | SendInput（全局） | SendMessageW（窗口级） |
| 物理键盘 | 会冲突 | **不冲突** |
| 适用场景 | 未绑定时 | **绑定后** |

**注意：** SendMessageW 对 Windows Terminal (ConPTY) 等现代应用无效。这些应用需要使用通用工具 + 窗口激活方式操作。

#### 鼠标滚轮

| 工具 | 参数 | 说明 |
|------|------|------|
| `mouse_wheel` | `coordinate: [x,y]`, `delta`, `direction?` | WM_MOUSEWHEEL 鼠标中键滚轮 |

**参数说明：**

- `delta`: 正值=向上，负值=向下。每 1 单位 ≈ 3 行
- `direction`: "vertical"（默认）或 "horizontal"
- `coordinate`: 滚轮作用点——决定哪个面板/区域接收滚动

**与通用 `scroll` 的区别：**

| | `scroll` | `mouse_wheel` |
|---|---|---|
| 原理 | WM_VSCROLL/WM_HSCROLL | **WM_MOUSEWHEEL** |
| Excel | 否 | 是 |
| 浏览器 | 否 | 是 |
| 代码编辑器 | 否 | 是 |

#### 元素级操作

| 工具 | 参数 | 说明 |
|------|------|------|
| `click_element` | `name?`, `role?`, `automationId?` | 按无障碍名称/角色点击 GUI 元素 |
| `type_into_element` | `name?`, `role?`, `automationId?`, `text` | 按名称向元素输入文字 |

**工作原理：**

1. 通过 UI Automation 在绑定窗口中查找匹配元素
2. `click_element`: 先尝试 InvokePattern（按钮/菜单），失败则 SendMessage 点击 BoundingRect 中心
3. `type_into_element`: 先尝试 ValuePattern 直接设值，失败则点击聚焦 + WM_CHAR 输入

**适用场景：**

- 截图中看到元素名称但坐标不精确时
- Accessibility Snapshot 列出了元素的 name/automationId 时
- 比坐标点击更可靠（不受窗口缩放/DPI 影响）

#### 终端交互

| 工具 | 参数 | 说明 |
|------|------|------|
| `open_terminal` | `agent`, `command?` | 打开新终端窗口并启动 AI agent（claude/codex/gemini/custom）。自动绑定窗口并截图验证 |
| `activate_window` | `click_x?`, `click_y?` | 激活绑定窗口：SetForegroundWindow + BringWindowToTop + 点击确保焦点 |
| `prompt_respond` | `response_type`, `arrow_direction?`, `arrow_count?`, `text?` | 处理终端 Yes/No/选择提示 |

**open_terminal agent 类型：**

| agent | 命令 | 说明 |
|-------|------|------|
| `claude` | `claude` | 启动 Claude Code |
| `codex` | `codex` | 启动 Codex |
| `gemini` | `gemini` | 启动 Gemini |
| `custom` | 用户指定 | 自定义命令 |

**response_type 详情：**

| response_type | 操作 | 场景 |
|---------------|------|------|
| `yes` | 发送 'y' + Enter | npm "Continue? (y/n)" |
| `no` | 发送 'n' + Enter | 拒绝确认 |
| `enter` | 发送 Enter | 接受默认选项 |
| `escape` | 发送 Escape | 取消操作 |
| `select` | ↑/↓ 箭头 × N + Enter | inquirer 选择菜单 |
| `type` | 输入文字 + Enter | 文本输入提示 |

#### 状态指示器

| 工具 | 参数 | 说明 |
|------|------|------|
| `status_indicator` | `action`: show/hide/status, `message?` | 控制绑定窗口底部的浮动状态标签 |

### 教学工具（3 个）

需要 `teachMode` 开启。

| 工具 | 说明 |
|------|------|
| `request_teach_access` | 请求教学引导模式权限 |
| `teach_step` | 显示一步引导提示，等用户点 Next |
| `teach_batch` | 批量排队多步引导 |

## 进阶

### 应用兼容性

| 应用类型 | SendMessageW (virtual_*) | 元素操作 (click_element) | 注意 |
|---------|--------------------------|------------------------|------|
| 传统 Win32 (记事本/写字板) | 完美支持 | 完美支持 | 完美支持 |
| Office (Excel/Word) | 支持（COM 自动化） | 支持 | 通过 COM API |
| WPF 应用 | 支持 | 支持 | 标准 UIA 支持 |
| Electron/Chrome | 部分支持 | 部分支持 | 内部渲染不走 Win32 消息 |
| UWP/WinUI (Windows Terminal) | 不支持 | 不支持 | ConPTY 不接受 SendMessageW |
| 浏览器网页内容 | 不支持 | 不支持 | 需要全局 SendInput |

**对于不支持 SendMessageW 的应用**，使用通用工具 (`left_click`/`type`/`key`) + `window_management(action="focus")` 先激活窗口。

### 绑定窗口时的可视化

绑定窗口后自动启动三层可视化：

1. **DWM 绿色边框** — 窗口自身的边框颜色变绿，零偏移
2. **虚拟鼠标光标** — 红色箭头图标，跟随 virtual_mouse 操作移动，点击时闪烁
3. **状态指示器** — 窗口底部浮动标签，显示当前操作（通过 status_indicator 控制）

### Accessibility Snapshot

每次 `screenshot` 时，如果窗口已绑定，会自动附带 GUI 元素列表：

```
GUI elements in this window:
[Button] "Save" (120,50 80x30) enabled
[Edit] "" (200,80 400x25) enabled value="hello" id=textBox1
[MenuItem] "File" (10,0 40x25) enabled
[MenuItem] "Edit" (50,0 40x25) enabled
[CheckBox] "Auto-save" (300,50 100x20) enabled id=chkAutoSave
```

模型同时收到 **截图图片 + 结构化元素列表**，可以选择：

- 用坐标操作：`virtual_mouse(action="click", coordinate=[120, 50])`
- 用名称操作：`click_element(name="Save")`

### UI Automation Control Patterns 参考

`click_element` / `type_into_element` 底层使用 UI Automation Control Patterns。当前已实现的和可扩展的：

| Pattern | 用途 | 当前状态 | 可用于 |
|---------|------|---------|--------|
| `InvokePattern` | 触发点击 | 已实现 (`click_element`) | 按钮、菜单项、链接 |
| `ValuePattern` | 读写文本值 | 已实现 (`type_into_element`) | 文本框、组合框 |
| `TogglePattern` | 切换状态 | 未实现 | 复选框、开关 |
| `SelectionPattern` | 选择项目 | 未实现 | 下拉菜单、列表 |
| `ScrollPattern` | 编程滚动 | 未实现（用 `mouse_wheel` 替代） | 列表、树、面板 |
| `ExpandCollapsePattern` | 展开/折叠 | 未实现 | 树节点、折叠面板 |
| `WindowPattern` | 窗口操作 | 未实现（用 `window_management` 替代） | 窗口最大化/关闭 |
| `TextPattern` | 读取文档文本 | 未实现 | 文档、富文本 |
| `GridPattern` | 表格操作 | 未实现 | Excel 单元格、数据网格 |
| `TablePattern` | 表格结构 | 未实现 | 表头、行列关系 |
| `RangeValuePattern` | 范围值操作 | 未实现 | 滑块、进度条 |
| `TransformPattern` | 移动/缩放 | 未实现 | 可拖拽元素 |

**扩展路线：** 优先实现 `TogglePattern`（复选框）和 `SelectionPattern`（下拉菜单），这两个在表单自动化中最常用。

### 输入方式技术矩阵

不同应用类型需要不同的输入方式：

| 输入方式 | API | 优势 | 限制 | 适用应用 |
|---------|-----|------|------|---------|
| **SendMessageW** | `WM_CHAR` / `WM_KEYDOWN` | 不抢焦点，不动真实键鼠 | 现代应用不支持 | Win32 传统应用 (记事本/Office/WPF) |
| **SendInput** | `INPUT` 结构体 | 所有应用都支持 | **必须前台焦点**，会干扰用户 | 所有应用（通用后备） |
| **WriteConsoleInput** | 控制台 API | 直接写入控制台缓冲区 | 需要 AttachConsole（可能被拒绝） | cmd/PowerShell（非 Windows Terminal） |
| **UI Automation** | `InvokePattern` / `ValuePattern` | 语义级操作，最可靠 | 部分应用不暴露 UIA 接口 | 支持 UIA 的应用 |
| **COM Automation** | Excel/Word COM | 完全编程控制 | 仅 Office 应用 | Excel / Word |
| **剪贴板 + 粘贴** | `SetClipboardData` + `Ctrl+V` | 绕过输入限制 | 会覆盖用户剪贴板 | 通用后备 |

**按应用类型的推荐输入策略：**

| 应用类型 | 首选 | 后备 | 说明 |
|---------|------|------|------|
| 传统 Win32 (记事本/写字板) | SendMessageW | UIA ValuePattern | 虚拟输入完美工作 |
| Office (Excel/Word) | COM Automation | SendMessageW | COM 提供结构化操作 |
| WPF 应用 | SendMessageW | UIA | 标准 Win32 消息循环 |
| Electron/Chrome 应用 | UIA | 剪贴板粘贴 | 内部渲染不走 Win32 |
| Windows Terminal (ConPTY) | SendInput (需前台) | 剪贴板粘贴 | ConPTY 不接受外部消息 |
| UWP/WinUI 应用 | SendInput (需前台) | UIA | XAML 渲染不走 Win32 消息 |

### 屏幕截取技术方案对比

当前使用 Python Bridge (mss) 进行截图，底层是 GDI BitBlt。三种方案对比：

| 方案 | API | 当前状态 | 性能 | 优势 | 限制 |
|------|-----|---------|------|------|------|
| **GDI BitBlt** | `BitBlt` / `PrintWindow` | 当前使用 (mss/bridge.py) | ~300ms | 简单稳定，支持后台窗口 (PrintWindow) | 不支持硬件加速内容、DPI 处理复杂 |
| **DXGI Desktop Duplication** | `IDXGIOutputDuplication` | 未实现 | ~16ms (60fps) | 硬件加速，支持 HDR，GPU 直接读取 | 不支持单窗口截取，需 D3D11 |
| **Windows.Graphics.Capture** | `GraphicsCaptureItem` | 未实现 | ~16ms | 最新 API，支持单窗口/单显示器，系统级权限管理 | Win10 1903+，首次需用户确认 |

**推荐升级路径：**

```
当前: GDI BitBlt (mss) ─── 全屏 ~300ms, 窗口 ~300ms (PrintWindow)
  │
  ├─ 近期: DXGI Desktop Duplication ─── 全屏 ~16ms, 但不支持单窗口
  │
  └─ 远期: Windows.Graphics.Capture ─── 全屏 + 单窗口都 ~16ms
```

**DXGI Desktop Duplication 实现要点：**

```python
# bridge.py 中可添加 DXGI 截图（通过 d3dshot 或 dxcam 库）
import dxcam  # pip install dxcam

camera = dxcam.create()
frame = camera.grab()  # numpy array, ~5ms
# 转为 JPEG base64 发送
```

**Windows.Graphics.Capture 实现要点：**

```python
# 需要 WinRT Python 绑定
# pip install winrt-Windows.Graphics.Capture winrt-Windows.Graphics.DirectX
# 限制：首次调用需要用户在系统弹窗中确认权限
```

### 已知限制与待解决

| 限制 | 影响 | 计划 |
|------|------|------|
| Windows Terminal 不接受 SendMessageW | 虚拟键盘/鼠标对终端无效 | 自动检测应用类型，终端类切换到 SendInput + 短暂激活 |
| PrintWindow 截不到 alternate screen buffer | Ink REPL 画面截不到 | 切换到 Windows.Graphics.Capture |
| Accessibility Snapshot 对大应用慢 (>30s) | Excel 等复杂应用超时 | 限制遍历深度 + 超时保护 |
| DWM 边框对自定义标题栏应用可能无效 | 某些 Electron 应用看不到边框 | 检测并回退到叠加窗口方案 |
| 虚拟光标是 PowerShell WinForms 进程 | 启动慢 (~1s)，资源占用 | 考虑用 Win32 原生窗口替代 |

### 技术路线图

#### Phase 1（当前）— 基础功能

- SendMessageW 虚拟输入
- PrintWindow/mss 截图
- UI Automation (InvokePattern + ValuePattern)
- Accessibility Snapshot
- DWM 边框指示
- Python Bridge

#### Phase 2（近期）— 兼容性增强

- 应用类型自动检测（Win32 vs Terminal vs UWP）
- 终端类应用自动切换 SendInput + 短暂激活
- TogglePattern / SelectionPattern 支持
- DXGI Desktop Duplication 高速截图
- Accessibility Snapshot 超时保护

#### Phase 3（远期）— 高级能力

- Windows.Graphics.Capture（单窗口实时截图）
- 截图元素标注（在截图上标记 ID 数字）
- 浏览器 DOM 提取（绑定浏览器时提取网页结构）
- GridPattern / TablePattern（Excel 单元格级操作）
- TextPattern（文档内容读取）
- 多窗口协同操作

## 配置

### Feature Flag

Computer Use 入口由 `CHICAGO_MCP` feature flag 控制。

- **Dev mode**：默认启用（`scripts/dev.ts` 全部启用）
- **Build mode**：默认启用（在 `DEFAULT_BUILD_FEATURES` 列表中）
- **运行时**：通过环境变量 `FEATURE_CHICAGO_MCP=1` 启用

入口位置：`src/main.tsx` 中 `feature("CHICAGO_MCP")` 门控，初始化 Computer Use MCP server。

### 跨平台架构要点

各平台由 dispatcher + backend 模式分发：

| 层 | macOS | Windows | Linux |
|----|-------|---------|-------|
| `computer-use-input/backends/` | darwin.ts | win32.ts | linux.ts |
| `computer-use-swift/backends/` | darwin.ts | win32.ts | linux.ts |
| `src/utils/computerUse/executor.ts` | darwin 路径 | 跨平台 executor | 跨平台 executor |
| `src/utils/computerUse/swiftLoader.ts` | darwin 加载 | platforms/ | platforms/ |

非 darwin 平台的关键差异：

- `drainRunLoop.ts` — 非 darwin 无需 CFRunLoop pump（直接执行 fn）
- `escHotkey.ts` — 非 darwin 返回 false（已有 Ctrl+C fallback）
- `hostAdapter.ts` — 非 darwin 权限检查逻辑：Windows 直接 granted，Linux 检查 xdotool 安装
- `common.ts` — 平台标识按 `process.platform` 动态分发：darwin→'native'，其他→'none'
- `gates.ts` — `hasRequiredSubscription()` 已按平台更新默认值

### 新增 Linux 后端的要点

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `packages/@ant/computer-use-input/src/backends/linux.ts` | xdotool 键鼠（mousemove/click/key/type/getactivewindow） |
| 2 | `packages/@ant/computer-use-swift/src/backends/linux.ts` | scrot/grim 截图 + xrandr 显示器 + wmctrl 窗口管理 |
| 3 | `packages/@ant/computer-use-input/src/index.ts` | dispatcher 加 `case 'linux'` |
| 4 | `packages/@ant/computer-use-swift/src/index.ts` | dispatcher 加 `case 'linux'` |
