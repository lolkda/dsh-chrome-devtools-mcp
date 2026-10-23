/**
 * Runtime status inference.
 *
 * mcp-client owns the child process and exposes no status RPC, so the launcher
 * leaves a PID record and the Host combines it with a direct CDP probe.
 */

import { readRuntime, readState } from './state.js'

export const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222'

export function normalizeBrowserUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return DEFAULT_BROWSER_URL
  const trimmed = value.trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : DEFAULT_BROWSER_URL
}

/** `EPERM` still means the process exists but belongs to someone else. */
export function isPidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

export async function checkCdp(browserUrl = DEFAULT_BROWSER_URL, { fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  const endpoint = `${normalizeBrowserUrl(browserUrl)}/json/version`
  try {
    const response = await fetchImpl(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      return { reachable: false, endpoint, error: `HTTP ${response.status}` }
    }
    const body = await response.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return { reachable: false, endpoint, error: '响应不是 JSON 对象' }
    }
    return {
      reachable: true,
      endpoint,
      browser: typeof body.Browser === 'string' ? body.Browser : null,
      protocolVersion: typeof body['Protocol-Version'] === 'string' ? body['Protocol-Version'] : null,
    }
  } catch (error) {
    const message = error && error.name === 'TimeoutError' ? '连接超时' : String(error?.message ?? error)
    return { reachable: false, endpoint, error: message }
  }
}

export async function getStatus({ dshHome, browserUrl = DEFAULT_BROWSER_URL, fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  const [configured, runtime] = await Promise.all([readState(dshHome), readRuntime(dshHome)])
  const alive = runtime ? isPidAlive(runtime.pid) : false
  const running = runtime
    ? {
        state: alive ? 'running' : 'stopped',
        pid: runtime.pid,
        spec: runtime.spec ?? null,
        startedAt: runtime.startedAt ?? null,
        endedAt: runtime.endedAt ?? null,
        exitCode: runtime.exitCode ?? null,
        ...(alive ? {} : { reason: 'launcher 进程已退出' }),
      }
    : { state: 'unknown', reason: '暂无启动记录' }

  return {
    configured: { mode: configured.mode, version: configured.version },
    ...(configured.warning ? { configuredWarning: configured.warning } : {}),
    running,
    cdp: await checkCdp(browserUrl, { fetchImpl, timeoutMs }),
    browserUrl: normalizeBrowserUrl(browserUrl),
  }
}
