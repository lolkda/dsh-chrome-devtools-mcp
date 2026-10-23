# Chrome DevTools 设置页与版本管理

## 1. 文档信息

- 文档标识：chrome-devtools-settings
- 规格状态：已确认
- 最后更新：2026-10-23
- 实现状态：已实现
- 验证状态：通过
- 关联文档：无

## 2. 目标与范围

### 背景

当前 `@lolkda/dsh-chrome-devtools-mcp@0.2.0` 是纯 patch bundle，直接用 `npx chrome-devtools-mcp@latest` 启动。它没有设置页，也没有宿主接口，用户无法在 DSH 内查看 MCP 状态、查看版本或切换版本。

### 目标

- 在 DSH 设置弹窗左侧导航新增“Chrome MCP”入口。
- 展示 MCP 进程、Chrome CDP 连通性、配置版本、运行版本和最新版本。
- 支持在 `latest` 与 GitHub Releases 中的稳定版本之间切换。
- 版本选择保存后写入状态文件，重启 DSH 进程后由 launcher 使用新版本。
- 生成并复制 Chrome 远程调试启动命令。
- 生成并复制 SSH 反向隧道命令。
- 提供 Windows OpenSSH Client 与可选 OpenSSH Server 的安装、启用命令。

### 非目标

- 不在浏览器中直接执行 Windows 上的 SSH 命令。
- 不实现不重启 DSH 的热切换。
- 不启动 Chrome，不管理 Chrome 安装。
- 不自动发布新版本到 npm。
- 不把 Chrome CDP 端口暴露到局域网。

## 3. 参与深度与委托

- 参与深度：架构与设计
- 局部例外：无
- 需要用户确认：设置入口位置、版本切换需重启生效、隧道命令采用生成并复制、Windows OpenSSH 命令需一并提供。上述事项已确认。
- 模型自主决定：宿主模块拆分、API 字段、状态推断方式、缓存策略、样式实现、测试组织。
- 当前执行授权：在 `/app/project/dsh-chrome-devtools-mcp` 内实现、测试、打包，并在临时 profile 中验证；不修改当前正式 `web` profile。

## 4. 行为要求与约束

### R-001：设置入口

- 参与者或触发方：打开 DSH 设置的用户。
- 前置条件与输入：插件已安装并在 web profile 中启用。
- 必须满足的行为：设置弹窗左侧导航出现“Chrome MCP”，点击后渲染本插件页面。
- 输出或状态变化：页面进入加载状态并请求状态与版本数据。
- 边界与失败行为：状态接口失败时页面仍渲染，显示错误与重试按钮。

### R-002：状态展示

- 参与者或触发方：设置页加载或用户点击刷新。
- 前置条件与输入：宿主可读取状态文件与运行时记录。
- 必须满足的行为：展示 MCP 进程状态、CDP 可达性、配置版本、运行版本、最新版本和 CDP 端点。
- 输出或状态变化：不可达状态显示明确原因，不伪装为已连接。
- 边界与失败行为：运行时记录缺失、PID 已退出、CDP 超时均显示为对应状态。

### R-003：版本列表

- 参与者或触发方：设置页加载或用户刷新版本列表。
- 前置条件与输入：宿主可访问 GitHub Releases，或已有缓存。
- 必须满足的行为：默认列出 `latest` 与稳定版本；prerelease 折叠；版本按语义版本降序。
- 输出或状态变化：显示数据来源（GitHub / 缓存 / npm）。
- 边界与失败行为：GitHub 限流或失败时使用缓存；无缓存时回退 npm；全部失败时显示错误并允许手动输入版本。

### R-004：版本保存

- 参与者或触发方：用户选择版本并点击应用。
- 前置条件与输入：版本为 `latest` 或合法 `x.y.z`。
- 必须满足的行为：合法选择原子写入状态文件；非法版本拒绝保存；页面提示“重启 DSH 后生效”。
- 输出或状态变化：配置版本立即更新，运行版本保持不变，直到重启。
- 边界与失败行为：写文件失败时不改变现有状态，显示错误。

### R-005：启动版本解析

- 参与者或触发方：DSH 启动 MCP client。
- 前置条件与输入：launcher 读取状态文件。
- 必须满足的行为：`latest` 使用 `chrome-devtools-mcp@latest`；固定版本使用 `chrome-devtools-mcp@x.y.z`。
- 输出或状态变化：launcher 写入运行时记录并启动 npx。
- 边界与失败行为：状态文件缺失或损坏时回退 `latest`；npx 启动失败时写退出信息并以非零码结束。

### R-006：SSH 反向隧道

- 参与者或触发方：用户在设置页填写 DSH 主机 SSH 用户名（不是 Windows 登录用户）。
- 前置条件与输入：DSH 页面地址可用。
- 必须满足的行为：生成 `ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 9222:127.0.0.1:9222 <user>@<host>`；提供复制按钮。
- 输出或状态变化：复制成功显示反馈；失败时选中文本供手动复制。
- 边界与失败行为：用户名为空时使用占位符，不把空字符串拼进命令。

### R-007：Windows OpenSSH 命令

- 参与者或触发方：用户展开 Windows OpenSSH 区域。
- 前置条件与输入：无。
- 必须满足的行为：提供 OpenSSH Client 检查/安装命令，以及可选 OpenSSH Server 安装、启动、开机自启和防火墙命令。
- 输出或状态变化：命令可复制。
- 边界与失败行为：明确说明反向隧道只需要 Client，Server 是可选能力。

### R-008：失败与降级

- 参与者或触发方：网络、进程、文件或接口失败。
- 前置条件与输入：任一依赖不可用。
- 必须满足的行为：单点失败不阻止页面渲染；错误信息可读；不影响其他设置页。
- 输出或状态变化：记录错误到响应；不抛出未处理异常破坏插件树。
- 边界与失败行为：宿主半边安装失败时只降级该半边并保留 DSH 启动。

### R-009：安全与校验

- 参与者或触发方：版本保存、命令生成、API 请求。
- 前置条件与输入：外部输入。
- 必须满足的行为：版本只接受 `latest` 或 semver；状态写入使用临时文件 + rename；不经过 shell 执行用户输入；API 走官方 `/api` 注册表。
- 输出或状态变化：拒绝非法输入并返回明确错误。
- 边界与失败行为：不将 CDP 端口暴露到局域网；不在日志中记录令牌。

### R-010：Chrome 远程调试启动命令

- 参与者或触发方：用户准备连接 Chrome。
- 前置条件与输入：用户在设置页打开“启动 Chrome”区域。
- 必须满足的行为：提供使用相对路径 `.\chrome.exe` 的 PowerShell 命令，包含 `--remote-debugging-port=9222`、独立的 `--user-data-dir`、`--no-first-run` 和 `--no-default-browser-check`；提供复制按钮和 CMD 版本。
- 输出或状态变化：命令被复制，用户进入 Chrome 安装目录后执行。
- 边界与失败行为：不硬编码 Chrome 安装路径；路径由用户通过 `chrome://version` 自行确认。

### 相关约束

- 当前 DSH 版本：`0.2.1-rc.2`。
- 官方 `/api` 通道由 `ctx.connection.fetch.register` 提供，Host/Origin fence 与会话鉴权由 DSH 完成。
- 设置页使用 `settings.section` 插槽，排在“技能”之后。
- 默认连接地址保持 `http://127.0.0.1:9222`。
- 浏览器页面不能直接执行本机 SSH 命令。

## 5. 关键决定

### D-001：Host + Client + Launcher 三段结构

- 状态：已确认
- 结论：插件由宿主半边、浏览器半边和 launcher 组成。
- 理由：纯 patch 无法提供设置页、状态接口和版本选择。
- 考虑过的备选：继续纯 patch；由设置页直接修改 profile YAML。
- 未采用原因：纯 patch 无 UI 能力；直接改 YAML 易破坏用户配置且无法可靠校验。
- 影响范围：R-001 至 R-005、R-008、R-009。

### D-002：版本选择写入状态文件

- 状态：委托范围内决定
- 结论：使用 `$DSH_HOME/dsh-chrome-devtools-mcp/state.json` 保存 `{ mode, version }`。
- 理由：launcher 与宿主共享一个稳定、可校验的契约，不修改 profile。
- 考虑过的备选：写 profile `cordis.patch.yml`、写环境变量。
- 未采用原因：profile 修改不可逆风险高；环境变量无法在运行中更新。
- 影响范围：R-004、R-005。

### D-003：版本列表以 GitHub 为主、npm 回退

- 状态：委托范围内决定
- 结论：优先 GitHub Releases，缓存 10 分钟；失败时回退 npm registry。
- 理由：用户明确要求 GitHub tag；npm 是最终安装源，作为兜底更可靠。
- 考虑过的备选：只查 GitHub；只查 npm。
- 未采用原因：GitHub 会限流；只查 npm 缺少 release 页面链接。
- 影响范围：R-003、R-008。

### D-004：状态通过进程 + CDP 推断

- 状态：委托范围内决定
- 结论：launcher 写 `runtime.json`，宿主检查 PID，并请求 `/json/version`。
- 理由：DSH mcp-client 没有公开状态查询接口。
- 考虑过的备选：解析进程表；直接连接 MCP 做 tools/list。
- 未采用原因：解析进程表无法知道 spec；MCP 握手成本高且需要额外协议实现。
- 影响范围：R-002。

### D-005：版本切换需重启 DSH

- 状态：已确认
- 结论：保存后不热重启 MCP，页面明确提示重启 DSH 进程。
- 理由：当前没有受支持的 MCP 子进程重启接口。
- 考虑过的备选：杀掉子进程依赖自动重连；触发 HMR。
- 未采用原因：可能造成工具注销或连接状态不确定。
- 影响范围：R-004、R-005。

### D-006：隧道“一键”定义为生成并复制

- 状态：已确认
- 结论：浏览器只负责生成和复制命令，不执行。
- 理由：浏览器无法在 Windows 本机执行 SSH；代跑需要额外的 SSH 主机授权。
- 考虑过的备选：调用 api-ssh MCP 执行。
- 未采用原因：当前没有保证可用的 Windows SSH 主机配置。
- 影响范围：R-006、R-007。

### D-007：设置入口顺序

- 状态：委托范围内决定
- 结论：`settings.section` 使用 `order: 64`，排在“技能”之后。
- 理由：与现有设置页顺序一致，避免插入到高频配置项之间。
- 考虑过的备选：排在最前。
- 未采用原因：Chrome DevTools 属于扩展配置，不是基础设置。
- 影响范围：R-001。

### D-008：Chrome 启动命令使用相对路径

- 状态：已确认
- 结论：命令使用 `.\chrome.exe`，用户先进入 Chrome 安装目录。
- 理由：不同机器安装位置不同，硬编码 `C:\Program Files\...` 不可靠。
- 考虑过的备选：自动探测安装路径；提供多个常见路径。
- 未采用原因：探测跨机器不可行；多路径列表仍会遗漏。
- 影响范围：R-010、AC-011。

## 6. 验收标准

### AC-001：设置入口可见

- 对应规则：R-001
- 前置条件：插件已安装并在 web profile 中启用。
- 操作或输入：打开设置弹窗。
- 预期结果：左侧导航出现“Chrome MCP”；点击后页面渲染状态卡片。
- 验证状态：通过
- 验证证据：Playwright 在临时 web profile 打开设置，左侧导航显示“Chrome MCP”，页面标题与状态卡片正常渲染。

### AC-002：状态展示

- 对应规则：R-002
- 前置条件：MCP 进程存在或不存在；CDP 可达或不可达。
- 操作或输入：打开页面或点击刷新。
- 预期结果：页面分别显示进程状态、CDP 状态、配置版本、运行版本、最新版本；不可达时不显示为已连接。
- 验证状态：通过
- 验证证据：Playwright 与 GET /status 均显示运行中 PID、CDP 无法连接、配置版本、运行版本、最新版本；页面没有把不可达显示为已连接。

### AC-003：版本列表

- 对应规则：R-003
- 前置条件：GitHub 可访问或存在缓存。
- 操作或输入：打开页面。
- 预期结果：显示 `latest` 与稳定版本，版本降序，prerelease 默认折叠，显示数据来源。
- 验证状态：通过
- 验证证据：GET /versions 返回 GitHub Releases，latest=1.12.0，版本按 1.12.0、1.11.0、1.10.1 降序；UI 下拉可见，预发布计数单独返回。

### AC-004：切换到 latest

- 对应规则：R-004、R-005
- 前置条件：当前为固定版本。
- 操作或输入：选择 `latest` 并应用，重启 DSH。
- 预期结果：`state.json` 为 `{ mode: "latest" }`；launcher 使用 `chrome-devtools-mcp@latest`。
- 验证状态：通过
- 验证证据：POST /version 返回 configured.mode=latest；state.json 写入 latest；重启后 runtime.spec 为 chrome-devtools-mcp@latest，进程参数一致。

### AC-005：切换到固定版本

- 对应规则：R-004、R-005
- 前置条件：版本列表中包含 `1.12.0`。
- 操作或输入：选择 `1.12.0` 并应用，重启 DSH。
- 预期结果：`state.json` 为 `{ mode: "pinned", version: "1.12.0" }`；launcher 使用 `chrome-devtools-mcp@1.12.0`。
- 验证状态：通过
- 验证证据：POST /version 写入 pinned 1.12.0；重启后 runtime.spec 与进程参数均为 chrome-devtools-mcp@1.12.0。UI 选择 1.11.0 后同样写入 state.json。

### AC-006：隧道命令复制

- 对应规则：R-006
- 前置条件：页面地址为 `http://192.168.1.100:3080`，用户名为 `alice`。
- 操作或输入：填写用户名并点击复制。
- 预期结果：命令包含 `-R 9222:127.0.0.1:9222 alice@192.168.1.100`，剪贴板写入成功并显示反馈。
- 验证状态：通过
- 验证证据：Playwright 填入 alice 后页面生成相同命令；点击复制后 navigator.clipboard.readText() 返回完全一致的命令。

### AC-007：Windows OpenSSH 命令

- 对应规则：R-007
- 前置条件：无。
- 操作或输入：展开 Windows OpenSSH 区域。
- 预期结果：可见 Client 与 Server 两组 PowerShell 命令，并说明反向隧道只需要 Client。
- 验证状态：通过
- 验证证据：Playwright 展开后可见 Add-WindowsCapability Client/Server、Start-Service、New-NetFirewallRule 命令及“反向隧道只需要 OpenSSH Client”说明。

### AC-008：网络失败降级

- 对应规则：R-003、R-008
- 前置条件：GitHub 返回 403 且存在缓存。
- 操作或输入：打开页面或刷新。
- 预期结果：显示缓存版本并提示“GitHub 限流，使用缓存”；页面不白屏。
- 验证状态：通过
- 验证证据：单元测试覆盖 GitHub 失败、GitHub 空列表、空缓存忽略三种路径，均回退 npm 或旧缓存；临时 profile 的 UI 在缓存数据下正常显示。

### AC-009：非法版本拒绝

- 对应规则：R-004、R-009
- 前置条件：请求体版本为 `../../evil`。
- 操作或输入：调用版本保存接口。
- 预期结果：返回 400；状态文件不变。
- 验证状态：通过
- 验证证据：POST /version 返回 400 invalid-selection；state.json 保持原值。单元测试也覆盖 traversal 输入。

### AC-010：工具名保持稳定

- 对应规则：R-005
- 前置条件：插件安装后重启 DSH。
- 操作或输入：查看 MCP 工具列表。
- 预期结果：工具名仍为 `mcp__chrome-devtools__*`，serverName 仍为 `chrome-devtools`。
- 验证状态：通过
- 验证证据：连接 Chrome/155.0.8059.85 后，mcp__chrome-devtools__list_pages 返回 1 个页面，mcp__chrome-devtools__take_snapshot 与 take_screenshot 成功；工具命名空间保持 mcp__chrome-devtools__*。

### AC-011：Chrome 启动命令

- 对应规则：R-010
- 前置条件：插件已安装并打开设置页。
- 操作或输入：查看“启动 Chrome”区域并点击复制。
- 预期结果：命令以 `.\chrome.exe` 开头，包含 9222、user-data-dir、no-first-run、no-default-browser-check；不包含硬编码安装路径；复制成功。
- 验证状态：通过
- 验证证据：Playwright 在临时 profile 打开设置页，截图包含“启动 Chrome”卡片；点击复制后剪贴板内容为 `.\chrome.exe --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\ChromeDebug" --no-first-run --no-default-browser-check`，命令中没有硬编码安装路径。

## 7. 未决问题与假设

### Q-001：prerelease 默认隐藏

- 类型：暂用假设
- 内容：默认只展示稳定版本，prerelease 折叠。
- 影响范围：R-003、AC-003。
- 是否阻塞：否。
- 决定或验证方式：实现后按用户反馈调整。

### Q-002：SSH 用户名记忆

- 类型：暂用假设
- 内容：DSH 主机 SSH 用户名保存在浏览器 `localStorage`，仅用于生成命令。
- 影响范围：R-006。
- 是否阻塞：否。
- 决定或验证方式：实现后验证清除浏览器数据会恢复为空。

### Q-003：多实例运行记录

- 类型：暂用假设
- 内容：多个 DSH 会话共享 `runtime.json` 时，状态显示最新写入的记录。
- 影响范围：R-002。
- 是否阻塞：否。
- 决定或验证方式：先按单实例模型实现，后续按需改为 PID 列表。

## 8. 技术设计

### 8.1 模块

- `lib/index.js`：宿主入口，延迟安装 HTTP 端点。
- `lib/routes.js`：注册 `/api/dsh-chrome-devtools-mcp/*`。
- `lib/state.js`：状态文件读写与校验。
- `lib/status.js`：PID、CDP、运行时状态。
- `lib/versions.js`：GitHub Releases、npm 回退、缓存。
- `lib/tunnel.js`：SSH 与 Windows OpenSSH 命令文本。
- `bin/launcher.mjs`：读取状态并启动 `npx chrome-devtools-mcp@<spec>`。
- `client/client.js`：注册 `settings.section` 并渲染页面。

### 8.2 数据文件

```text
$DSH_HOME/dsh-chrome-devtools-mcp/state.json
$DSH_HOME/dsh-chrome-devtools-mcp/runtime.json
$DSH_HOME/dsh-chrome-devtools-mcp/releases-cache.json
```

### 8.3 HTTP 接口

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/dsh-chrome-devtools-mcp/status` | 进程、CDP、配置与运行版本 |
| GET | `/api/dsh-chrome-devtools-mcp/versions?refresh=1` | 版本列表与来源 |
| POST | `/api/dsh-chrome-devtools-mcp/version` | 保存版本选择 |
| GET | `/api/dsh-chrome-devtools-mcp/tunnel` | 主机地址与命令模板 |

### 8.4 启动流程

```text
DSH 启动
  → mcp-client 启动 launcher
  → launcher 读取 state.json
  → 选择 chrome-devtools-mcp@latest 或 @x.y.z
  → 写入 runtime.json
  → spawn npx
  → MCP client 完成 initialize/tools list
```

### 8.5 状态推断

- PID 存活：`process.kill(pid, 0)`。
- CDP：`GET <browserUrl>/json/version`，1.5 秒超时。
- 运行版本：runtime.json 的 `spec`；`latest` 时标注“启动时解析”。
- 配置版本：state.json。
- 最新版本：版本列表中的 latest。

### 8.6 安全

- 版本只接受 `latest` 或 `^\d+\.\d+\.\d+$`。
- 状态写入使用同目录临时文件 + rename，权限 `0600`。
- launcher 使用 `spawn` 数组参数，不设置 `shell: true`。
- SSH 命令只生成与复制，不执行。
- HTTP 端点走官方注册表，由宿主完成鉴权。
