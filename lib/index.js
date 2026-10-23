/**
 * Host half: registers the settings-page API.
 *
 * The route install is deliberately optional. A headless or SDK profile has no
 * web connection, and a settings page must never prevent the profile from
 * booting.
 */

import { installRoutes, ROUTE_PREFIX } from './routes.js'
import { normalizeBrowserUrl, DEFAULT_BROWSER_URL } from './status.js'
import { resolveDshHome } from './state.js'

export const name = 'dsh-chrome-devtools-mcp'
export const inject = []

function serviceOf(ctx, service) {
  try {
    const direct = ctx?.[service]
    if (direct !== undefined) return direct
  } catch {
    // Frozen proxies can throw on property access.
  }
  try {
    return ctx?.get?.(service)
  } catch {
    return undefined
  }
}

function attempt(install, label, log) {
  try {
    const dispose = install()
    return typeof dispose === 'function' ? dispose : () => {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`${label}安装失败，该部分已停用：${message}`)
    return () => {}
  }
}

export function apply(ctx, config = {}) {
  const dshHome = typeof config.dshHome === 'string' && config.dshHome.trim() ? config.dshHome.trim() : resolveDshHome()
  const browserUrl = normalizeBrowserUrl(config.browserUrl || process.env.CHROME_DEVTOOLS_BROWSER_URL || DEFAULT_BROWSER_URL)
  const log = (message) => {
    console.warn(`[dsh-chrome-devtools-mcp] ${message}`)
  }
  const effect = typeof ctx.effect === 'function' ? (fn, label) => ctx.effect(fn, label) : (fn) => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  }

  const install = (inner) => {
    const connection = serviceOf(inner, 'connection')
    if (!connection || typeof connection.fetch?.register !== 'function') return () => {}
    return installRoutes(connection, { dshHome, browserUrl })
  }

  const ready = serviceOf(ctx, 'webServer') !== undefined && serviceOf(ctx, 'connection') !== undefined
  if (ready) {
    effect(() => attempt(() => install(ctx), 'HTTP 端点', log), 'chrome-devtools-mcp: HTTP 端点')
    return
  }

  if (typeof ctx.inject !== 'function') {
    log(`缺少 connection 服务，且当前上下文不支持延迟注入；${ROUTE_PREFIX} 未注册`)
    return
  }
  ctx.inject(['webServer', 'connection'], (inner) => {
    effect(() => attempt(() => install(inner), 'HTTP 端点', log), 'chrome-devtools-mcp: HTTP 端点')
  })
}

export { ROUTE_PREFIX }
