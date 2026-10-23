# Changelog

## 0.3.2

- 解除 DSH 版本门禁：`engines.dsh` 与 `dsh.compatibility.dsh` 改为 `*`，不再仅因宿主版本号拒绝安装或启动。

## 0.3.1

- 设置页新增“启动 Chrome”卡片，使用相对路径 `.\chrome.exe` 启动远程调试。
- 提供 PowerShell、CMD 命令和复制按钮，不硬编码 Chrome 安装路径。
- 修正 SSH 用户名说明，明确为 DSH 主机账号，不是 Windows 登录用户。
- 新增 GitHub Actions CI 和 npm trusted publishing（OIDC）发布工作流。
- 安装说明改为 npm 包 `@lolkda/dsh-chrome-devtools-mcp`。

## 0.3.0

- 新增设置弹窗左侧“Chrome DevTools”页面。
- 展示 MCP 进程、CDP 连通性、配置版本、运行版本和最新版本。
- 支持在 `latest` 与 GitHub Releases 稳定版本之间切换。
- 新增版本状态文件、运行时 PID 记录和可切换版本的 launcher。
- 新增 SSH 反向隧道命令生成与复制。
- 新增 Windows OpenSSH Client/Server 安装与启用命令。
- 版本列表优先 GitHub Releases，失败时回退缓存与 npm。

## 0.2.0

- 改为纯 patch bundle，通过 `npx chrome-devtools-mcp@latest` 跟随上游最新版。
- 移除本地 launcher 和 `chrome-devtools-mcp` 固定依赖。
- 每次 DSH 启动时重新解析 npm `latest` dist-tag。

## 0.1.0

- 首个版本：把 Chrome DevTools MCP 封装成 DSH profile bundle。
- 通过包内依赖启动 `chrome-devtools-mcp`，不再依赖启动时的 `npx @latest`。
- 支持 `CHROME_DEVTOOLS_BROWSER_URL` 覆盖默认的 `http://127.0.0.1:9222`。
