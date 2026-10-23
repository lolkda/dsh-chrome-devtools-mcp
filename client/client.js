/**
 * Browser half: the "Chrome DevTools" settings section.
 *
 * It deliberately uses plain React elements and the DSH design tokens instead of
 * importing a UI primitives package. The page must keep rendering even when one
 * endpoint is down, so every data source has its own error and retry path.
 */

window.__ModuleLoader__.load({
  id: '@lolkda/dsh-chrome-devtools-mcp',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const ROUTE = '/api/dsh-chrome-devtools-mcp'
    const SECTION_ORDER = 64
    const STYLE_ID = 'dsh-chrome-devtools-mcp'
    const SSH_USER_KEY = 'dsh-chrome-devtools-mcp.ssh-user'
    const DEFAULT_REMOTE_PORT = 9222

    const CHROME_DEBUG_PS = '.\\chrome.exe --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\\ChromeDebug" --no-first-run --no-default-browser-check'
    const CHROME_DEBUG_CMD = '.\\chrome.exe --remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\\ChromeDebug --no-first-run --no-default-browser-check'
    const CHROME_PATH_HINT = '在 Chrome 地址栏打开 chrome://version，查看“可执行文件路径”，然后 cd 到该目录。'

    const FALLBACK_WINDOWS_CLIENT = [
      { label: '检查 OpenSSH Client', command: "Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'" },
      { label: '安装 OpenSSH Client', command: 'Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0' },
    ]
    const FALLBACK_WINDOWS_SERVER = [
      { label: '检查 OpenSSH Server', command: "Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'" },
      { label: '安装 OpenSSH Server', command: 'Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0' },
      { label: '启动并设为开机自启', command: 'Start-Service sshd\nSet-Service -Name sshd -StartupType Automatic' },
      { label: '放行 22 端口', command: "New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22" },
    ]

    function errorMessage(error) {
      if (!error) return '未知错误'
      if (error.name === 'AbortError') return ''
      return error instanceof Error ? error.message : String(error)
    }

    async function request(path, { signal, method = 'GET', body } = {}) {
      const response = await fetch(`${ROUTE}${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
      const payload = await response.json().catch(() => null)
      if (!payload) {
        if (response.status === 401) throw new Error('浏览器会话未认证（HTTP 401），请刷新页面后重试')
        if (response.status === 403) throw new Error('宿主拒绝了请求（HTTP 403），请使用 DSH 启动时给出的地址访问')
        throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）`)
      }
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `请求失败（HTTP ${response.status}）`)
      return payload
    }

    function injectStyle() {
      const existing = document.getElementById(STYLE_ID)
      if (existing) return null
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return tag
    }

    function formatTime(value) {
      if (!value) return '—'
      const date = new Date(value)
      return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
    }

    function specLabel(spec) {
      if (!spec) return '—'
      return spec.startsWith('chrome-devtools-mcp@') ? spec.slice('chrome-devtools-mcp@'.length) : spec
    }

    function configuredLabel(configured) {
      if (!configured) return '—'
      return configured.mode === 'latest' ? 'latest（跟随最新）' : configured.version
    }

    function statusBadge(status) {
      if (!status) return { tone: 'muted', text: '读取中' }
      if (status.cdp?.reachable) return { tone: 'ok', text: '已连接' }
      if (status.running?.state === 'running') return { tone: 'warn', text: 'Chrome 未连接' }
      return { tone: 'bad', text: '未连接' }
    }

    function sourceLabel(versions) {
      if (!versions) return ''
      if (versions.source === 'github') return 'GitHub Releases'
      if (versions.source === 'npm') return 'npm 回退'
      if (versions.source === 'cache') return versions.upstreamSource === 'github' ? '缓存（GitHub）' : versions.upstreamSource === 'npm' ? '缓存（npm）' : '缓存'
      return versions.source
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dscd-error', role: 'alert' }, `设置页渲染失败：${errorMessage(this.state.error)}`)
        }
        return this.props.children
      }
    }

    function Row({ label, children, tone }) {
      return h('div', { className: 'dscd-row' },
        h('span', { className: 'dscd-row-label' }, label),
        h('span', { className: tone ? `dscd-row-value dscd-tone-${tone}` : 'dscd-row-value' }, children),
      )
    }

    function Commands({ title, items, prefix, copied, onCopy }) {
      return h('div', { className: 'dscd-commands' },
        h('h4', { className: 'dscd-subhead' }, title),
        items.map((item, index) => {
          const key = `${prefix}-${index}`
          return h('div', { className: 'dscd-command', key },
            h('div', { className: 'dscd-command-head' },
              h('span', null, item.label),
              h('button', {
                type: 'button',
                className: 'dscd-button dscd-button--ghost',
                onClick: () => onCopy(item.command, key),
              }, copied === key ? '已复制' : '复制'),
            ),
            h('pre', { className: 'dscd-code' }, item.command),
          )
        }),
      )
    }

    function ChromeDevtoolsSection() {
      const [status, setStatus] = useState(null)
      const [versions, setVersions] = useState(null)
      const [tunnel, setTunnel] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [versionLoading, setVersionLoading] = useState(false)
      const [error, setError] = useState('')
      const [versionError, setVersionError] = useState('')
      const [actionError, setActionError] = useState('')
      const [notice, setNotice] = useState('')
      const [selection, setSelection] = useState(null)
      const [manualVersion, setManualVersion] = useState('')
      const [saving, setSaving] = useState(false)
      const [copied, setCopied] = useState('')
      const [sshUser, setSshUser] = useState(() => {
        try {
          return localStorage.getItem(SSH_USER_KEY) || ''
        } catch {
          return ''
        }
      })

      useEffect(() => {
        const controller = new AbortController()
        let cancelled = false
        async function load() {
          setLoading(true)
          const results = await Promise.allSettled([
            request('/status', { signal: controller.signal }),
            request('/versions', { signal: controller.signal }),
            request('/tunnel', { signal: controller.signal }),
          ])
          if (cancelled) return
          const [statusResult, versionsResult, tunnelResult] = results
          if (statusResult.status === 'fulfilled') {
            setStatus(statusResult.value)
            setError('')
          } else {
            const message = errorMessage(statusResult.reason)
            if (message) setError(message)
          }
          if (versionsResult.status === 'fulfilled') {
            setVersions(versionsResult.value)
            setVersionError('')
          } else {
            const message = errorMessage(versionsResult.reason)
            if (message) setVersionError(message)
          }
          if (tunnelResult.status === 'fulfilled') setTunnel(tunnelResult.value)
          setLoading(false)
        }
        void load()
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [])

      useEffect(() => {
        if (selection !== null || !status) return
        setSelection(status.configured.mode === 'latest' ? 'latest' : status.configured.version)
      }, [status, selection])

      useEffect(() => {
        try {
          localStorage.setItem(SSH_USER_KEY, sshUser)
        } catch {
          // Private browsing may reject localStorage; the command still works.
        }
      }, [sshUser])

      useEffect(() => {
        if (!copied) return undefined
        const timer = setTimeout(() => setCopied(''), 1800)
        return () => clearTimeout(timer)
      }, [copied])

      const options = useMemo(() => {
        const list = (versions?.items ?? []).slice()
        const configuredVersion = status?.configured?.mode === 'pinned' ? status.configured.version : null
        if (configuredVersion && !list.some((item) => item.version === configuredVersion)) {
          list.unshift({ version: configuredVersion, tag: `v${configuredVersion}`, publishedAt: null })
        }
        return list
      }, [versions, status])

      const needsManual = Boolean(versionError) || options.length === 0
      const targetVersion = manualVersion.trim() || (selection && selection !== 'latest' ? selection : '')
      const canApply = !saving && (selection === 'latest' || targetVersion !== '')
      const pendingRestart = Boolean(
        status
        && status.running?.state === 'running'
        && (
          status.configured.mode === 'latest'
            ? status.running.spec !== 'chrome-devtools-mcp@latest'
            : status.running.spec !== `chrome-devtools-mcp@${status.configured.version}`
        ),
      )

      const refreshStatus = useCallback(async () => {
        setRefreshing(true)
        try {
          const data = await request('/status')
          setStatus(data)
          setError('')
        } catch (failure) {
          setError(errorMessage(failure))
        } finally {
          setRefreshing(false)
        }
      }, [])

      const refreshVersions = useCallback(async () => {
        setVersionLoading(true)
        try {
          const data = await request('/versions?refresh=1')
          setVersions(data)
          setVersionError('')
        } catch (failure) {
          setVersionError(errorMessage(failure))
        } finally {
          setVersionLoading(false)
        }
      }, [])

      const applyVersion = useCallback(async () => {
        if (!canApply) return
        const body = selection === 'latest' || (!manualVersion.trim() && selection === 'latest')
          ? { mode: 'latest' }
          : { mode: 'pinned', version: manualVersion.trim() || selection }
        if (body.mode === 'pinned' && !/^\d+\.\d+\.\d+$/.test(body.version)) {
          setActionError('固定版本必须是 x.y.z 形式')
          return
        }
        setSaving(true)
        setActionError('')
        setNotice('')
        try {
          const data = await request('/version', { method: 'POST', body })
          setStatus((current) => current
            ? { ...current, configured: data.configured }
            : { configured: data.configured, running: { state: 'unknown' }, cdp: { reachable: false }, browserUrl: 'http://127.0.0.1:9222' })
          setSelection(data.configured.mode === 'latest' ? 'latest' : data.configured.version)
          setManualVersion('')
          setNotice('已保存。重启 DSH 进程后生效；刷新页面不会切换正在运行的 MCP。')
        } catch (failure) {
          setActionError(errorMessage(failure))
        } finally {
          setSaving(false)
        }
      }, [canApply, manualVersion, selection])

      const copyText = useCallback(async (text, key) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(key)
          return
        } catch {
          // Fall through to the textarea fallback.
        }
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.setAttribute('readonly', 'readonly')
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          const ok = document.execCommand('copy')
          area.remove()
          if (ok) setCopied(key)
          else setActionError('复制失败，请手动选择命令文本')
        } catch {
          setActionError('复制失败，请手动选择命令文本')
        }
      }, [])

      const pageHost = typeof window !== 'undefined' ? window.location.hostname : ''
      const tunnelHost = pageHost && !['localhost', '127.0.0.1', '::1'].includes(pageHost)
        ? pageHost
        : tunnel?.host || pageHost || '127.0.0.1'
      const sshPort = tunnel?.sshPort ?? 22
      const remotePort = tunnel?.remotePort ?? DEFAULT_REMOTE_PORT
      const sshAccount = sshUser.trim() || '<user>'
      const portArgument = sshPort === 22 ? '' : ` -p ${sshPort}`
      const sshCommand = `ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes${portArgument} -R ${remotePort}:127.0.0.1:${remotePort} ${sshAccount}@${tunnelHost}`
      const windowsClient = tunnel?.windowsClient ?? FALLBACK_WINDOWS_CLIENT
      const windowsServer = tunnel?.windowsServer ?? FALLBACK_WINDOWS_SERVER
      const badge = statusBadge(status)
      const source = sourceLabel(versions)

      if (loading) {
        return h('section', { className: 'dscd-section' },
          h('h2', { className: 'dscd-title' }, 'Chrome DevTools'),
          h('p', { className: 'dscd-hint' }, '正在读取 MCP 状态…'),
        )
      }

      return h('section', { className: 'dscd-section' },
        h('header', { className: 'dscd-header' },
          h('div', null,
            h('h2', { className: 'dscd-title' }, 'Chrome DevTools'),
            h('p', { className: 'dscd-subtitle' }, 'MCP 进程、Chrome CDP 连接和上游版本。'),
          ),
          h('span', { className: `dscd-badge dscd-badge--${badge.tone}` }, badge.text),
        ),

        error ? h('div', { className: 'dscd-error', role: 'alert' },
          h('span', null, error),
          h('button', { type: 'button', className: 'dscd-button dscd-button--ghost', onClick: refreshStatus }, '重试'),
        ) : null,

        h('div', { className: 'dscd-card' },
          h('div', { className: 'dscd-card-head' },
            h('h3', null, '状态'),
            h('button', { type: 'button', className: 'dscd-button dscd-button--ghost', onClick: refreshStatus, disabled: refreshing }, refreshing ? '刷新中…' : '刷新'),
          ),
          h('div', { className: 'dscd-grid' },
            h(Row, { label: 'MCP 进程', tone: status?.running?.state === 'running' ? 'ok' : 'muted' },
              status?.running?.state === 'running'
                ? `运行中 · PID ${status.running.pid}`
                : status?.running?.state === 'stopped' ? '已退出' : '未知',
            ),
            h(Row, { label: '运行版本' }, specLabel(status?.running?.spec)),
            h(Row, { label: 'Chrome CDP', tone: status?.cdp?.reachable ? 'ok' : 'bad' },
              status?.cdp?.reachable ? (status.cdp.browser || '已连接') : (status?.cdp?.error ? `无法连接：${status.cdp.error}` : '不可达'),
            ),
            h(Row, { label: '配置版本' }, configuredLabel(status?.configured)),
            h(Row, { label: '最新版本' }, versions?.latest || '—'),
            h(Row, { label: 'CDP 端点' }, status?.browserUrl || '—'),
          ),
          pendingRestart ? h('p', { className: 'dscd-notice', role: 'status' }, '配置版本与运行版本不一致：重启 DSH 进程后生效。') : null,
          status?.running?.startedAt ? h('p', { className: 'dscd-foot' }, `启动于 ${formatTime(status.running.startedAt)}`) : null,
          status?.configuredWarning ? h('p', { className: 'dscd-error' }, status.configuredWarning) : null,
        ),

        h('div', { className: 'dscd-card' },
          h('div', { className: 'dscd-card-head' },
            h('h3', null, '版本'),
            h('span', { className: 'dscd-meta' }, source || '未加载'),
          ),
          h('label', { className: 'dscd-field' },
            h('span', null, '上游版本'),
            h('select', {
              className: 'dscd-select',
              value: selection ?? '',
              onChange: (event) => { setSelection(event.target.value); setManualVersion('') },
            },
              h('option', { value: 'latest' }, 'latest（跟随最新）'),
              options.map((item) => h('option', { key: item.version, value: item.version },
                `${item.version}${item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString()}` : ''}`,
              )),
            ),
          ),
          versions?.prereleaseCount ? h('p', { className: 'dscd-hint' }, `已隐藏 ${versions.prereleaseCount} 个预发布版本。`) : null,
          versionError ? h('div', { className: 'dscd-error' },
            h('span', null, versionError),
            h('button', { type: 'button', className: 'dscd-button dscd-button--ghost', onClick: refreshVersions }, '重试'),
          ) : null,
          needsManual ? h('label', { className: 'dscd-field' },
            h('span', null, '手动输入版本（GitHub 不可用时）'),
            h('input', {
              className: 'dscd-input',
              value: manualVersion,
              placeholder: '1.12.0',
              onChange: (event) => setManualVersion(event.target.value),
            }),
          ) : null,
          versions?.warning ? h('p', { className: 'dscd-hint' }, versions.warning) : null,
          h('div', { className: 'dscd-actions' },
            h('button', { type: 'button', className: 'dscd-button dscd-button--primary', onClick: applyVersion, disabled: !canApply }, saving ? '保存中…' : '应用'),
            h('button', { type: 'button', className: 'dscd-button dscd-button--ghost', onClick: refreshVersions, disabled: versionLoading }, versionLoading ? '刷新中…' : '刷新版本列表'),
          ),
          notice ? h('p', { className: 'dscd-notice', role: 'status' }, notice) : null,
          actionError ? h('p', { className: 'dscd-error', role: 'alert' }, actionError) : null,
          h('p', { className: 'dscd-foot' }, '保存只改变下次启动使用的版本。当前运行的 MCP 不会被热替换。'),
        ),

        h('div', { className: 'dscd-card' },
          h('div', { className: 'dscd-card-head' },
            h('h3', null, '启动 Chrome'),
            h('span', { className: 'dscd-meta' }, '远程调试'),
          ),
          h('p', { className: 'dscd-hint' }, '先打开 PowerShell，进入 Chrome 安装目录，然后执行：'),
          h('pre', { className: 'dscd-code' }, CHROME_DEBUG_PS),
          h('div', { className: 'dscd-actions' },
            h('button', { type: 'button', className: 'dscd-button dscd-button--primary', onClick: () => copyText(CHROME_DEBUG_PS, 'chrome-ps') }, copied === 'chrome-ps' ? '已复制' : '复制启动命令'),
          ),
          h('details', { className: 'dscd-details' },
            h('summary', null, '如何找到安装目录 / CMD 版本'),
            h('p', { className: 'dscd-hint' }, CHROME_PATH_HINT),
            h('p', { className: 'dscd-hint' }, 'CMD 版本：'),
            h('pre', { className: 'dscd-code' }, CHROME_DEBUG_CMD),
            h('div', { className: 'dscd-actions' },
              h('button', { type: 'button', className: 'dscd-button dscd-button--ghost', onClick: () => copyText(CHROME_DEBUG_CMD, 'chrome-cmd') }, copied === 'chrome-cmd' ? '已复制' : '复制 CMD 命令'),
            ),
          ),
          h('p', { className: 'dscd-foot' }, '调试 profile 与日常 Chrome 分开；首次启动需要重新登录。'),
        ),

        h('div', { className: 'dscd-card' },
          h('div', { className: 'dscd-card-head' },
            h('h3', null, 'SSH 反向隧道'),
            h('span', { className: 'dscd-meta' }, '只生成命令，不执行'),
          ),
          h('label', { className: 'dscd-field' },
            h('span', null, 'SSH 用户名（DSH 主机账号）'),
            h('input', {
              className: 'dscd-input',
              value: sshUser,
              placeholder: 'user',
              onChange: (event) => setSshUser(event.target.value),
            }),
          ),
          h('p', { className: 'dscd-hint' }, '在 Windows PowerShell 中执行，保持窗口常驻。OpenSSH Server 的安装与防火墙命令需要管理员权限。'),
          h('pre', { className: 'dscd-code' }, sshCommand),
          h('div', { className: 'dscd-actions' },
            h('button', { type: 'button', className: 'dscd-button dscd-button--primary', onClick: () => copyText(sshCommand, 'ssh') }, copied === 'ssh' ? '已复制' : '复制命令'),
          ),
          h('details', { className: 'dscd-details' },
            h('summary', null, 'Windows OpenSSH 安装与开启'),
            h('p', { className: 'dscd-hint' }, '反向隧道只需要 OpenSSH Client。OpenSSH Server 是可选能力，只有需要从 DSH 主动 SSH 到 Windows 时才需要。'),
            h(Commands, { title: 'OpenSSH Client', items: windowsClient, prefix: 'client', copied, onCopy: copyText }),
            h(Commands, { title: 'OpenSSH Server（可选）', items: windowsServer, prefix: 'server', copied, onCopy: copyText }),
          ),
          h('p', { className: 'dscd-foot' }, '命令中的 127.0.0.1:9222 是 DSH 主机侧地址；隧道把 Windows 的 Chrome CDP 映射到这里。'),
        ),
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.effect(() => {
        const tag = injectStyle()
        return () => {
          if (tag !== null) tag.remove()
        }
      }, 'chrome-devtools-mcp: settings styles')

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-chrome-devtools-mcp',
        order: SECTION_ORDER,
        label: () => 'Chrome MCP',
        inject: () => ({}),
      }, () => h(Boundary, null, h(ChromeDevtoolsSection))))
    }

    const CSS = `
.dscd-section{max-width:760px;min-width:0;display:flex;flex-direction:column;gap:12px;padding-bottom:12px;color:var(--dsw-alias-label-primary)}
.dscd-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}
.dscd-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.dscd-subtitle{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dscd-badge{flex:none;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:12px;font-size:12px;line-height:24px;white-space:nowrap}
.dscd-badge--ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.dscd-badge--warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary)}
.dscd-badge--bad{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.dscd-badge--muted{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.dscd-card{display:flex;flex-direction:column;gap:10px;min-width:0;padding:14px;border:.5px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-base)}
.dscd-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.dscd-card-head h3{margin:0;font-size:14px;line-height:22px;font-weight:600}
.dscd-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-quaternary)}
.dscd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;min-width:0}
.dscd-row{display:flex;flex-direction:column;gap:2px;min-width:0;padding:6px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dscd-row-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dscd-row-value{font-size:13px;line-height:20px;overflow-wrap:anywhere}
.dscd-tone-ok{color:var(--dsw-alias-state-success-primary)}
.dscd-tone-bad{color:var(--dsw-alias-state-error-primary)}
.dscd-tone-muted{color:var(--dsw-alias-label-tertiary)}
.dscd-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dscd-select,.dscd-input{box-sizing:border-box;width:100%;height:34px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dscd-select:focus,.dscd-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dscd-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dscd-button{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;white-space:nowrap}
.dscd-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dscd-button:disabled{color:var(--dsw-alias-label-quaternary);border-color:var(--dsw-alias-border-l4);cursor:default}
.dscd-button--primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dscd-button--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dscd-button--primary:disabled{background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-quaternary)}
.dscd-button--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.dscd-hint,.dscd-foot{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-quaternary);overflow-wrap:anywhere}
.dscd-error{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0;padding:8px 10px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dscd-notice{margin:0;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dscd-code{margin:0;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:11px;line-height:17px;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;max-height:220px}
.dscd-details{border-top:.5px solid var(--dsw-alias-border-l1);padding-top:8px}
.dscd-details summary{cursor:pointer;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dscd-subhead{margin:8px 0 4px;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dscd-command{display:flex;flex-direction:column;gap:4px;margin:6px 0}
.dscd-command-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dscd-command-head .dscd-button{min-height:26px;padding:0 8px;font-size:11px}
@media(max-width:640px){.dscd-grid{grid-template-columns:1fr}.dscd-header{flex-direction:column}.dscd-badge{align-self:flex-start}}
`

    return { name: 'dsh-chrome-devtools-mcp', inject, apply }
  },
})
