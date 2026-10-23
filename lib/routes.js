/**
 * Exact `/api` endpoints for the settings page.
 *
 * Registration goes through the official connection fetch registry, so the
 * Host's origin fence and browser-session authentication already ran before a
 * request reaches this module.
 */

import { assertVersionExists, cachedVersionNames, loadVersions } from './versions.js'
import { getStatus, normalizeBrowserUrl } from './status.js'
import { normalizeSelection, writeState } from './state.js'
import { tunnelInfo } from './tunnel.js'

export const ROUTE_PREFIX = '/api/dsh-chrome-devtools-mcp'

const ENDPOINTS = [
  { path: '/status', methods: ['GET'] },
  { path: '/versions', methods: ['GET'] },
  { path: '/version', methods: ['POST'] },
  { path: '/tunnel', methods: ['GET'] },
]

const MAX_BODY_BYTES = 4096

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function failure(status, message, code = 'error') {
  return json(status, { ok: false, code, error: message })
}

async function readBody(request) {
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { status: 413 })
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { status: 413 })
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 })
  }
}

export function installRoutes(connection, options) {
  if (!connection || typeof connection.fetch?.register !== 'function') {
    throw new Error('connection 服务缺少 fetch.register，无法注册设置页端点')
  }
  const disposers = ENDPOINTS.map((endpoint) =>
    connection.fetch.register({
      path: `${ROUTE_PREFIX}${endpoint.path}`,
      methods: endpoint.methods,
      requestBody: 'buffered',
      fetch: (request) => handle(request, options),
    }),
  )
  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose()
  }
}

export async function handle(request, options = {}) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  try {
    if (path === `${ROUTE_PREFIX}/status`) {
      return json(200, {
        ok: true,
        ...(await getStatus({
          dshHome: options.dshHome,
          browserUrl: normalizeBrowserUrl(options.browserUrl),
          fetchImpl: options.fetchImpl,
        })),
      })
    }
    if (path === `${ROUTE_PREFIX}/versions`) {
      return json(200, {
        ok: true,
        ...(await loadVersions({
          dshHome: options.dshHome,
          refresh: url.searchParams.get('refresh') === '1',
          fetchImpl: options.fetchImpl,
        })),
      })
    }
    if (path === `${ROUTE_PREFIX}/tunnel`) {
      return json(200, { ok: true, ...tunnelInfo(options.tunnel) })
    }
    if (path === `${ROUTE_PREFIX}/version`) {
      if (request.method !== 'POST') return failure(405, '只支持 POST')
      const body = await readBody(request)
      let selection
      try {
        selection = normalizeSelection(body)
      } catch (error) {
        return failure(400, error.message, 'invalid-selection')
      }
      if (selection.mode === 'pinned') {
        try {
          const known = await cachedVersionNames(options.dshHome)
          await assertVersionExists(selection.version, { fetchImpl: options.fetchImpl, knownVersions: known })
        } catch (error) {
          return failure(400, error.message, 'invalid-version')
        }
      }
      const configured = await writeState(options.dshHome, selection)
      return json(200, { ok: true, configured, restartRequired: true })
    }
    return failure(404, '端点不存在', 'not-found')
  } catch (error) {
    const status = Number(error?.status) || 500
    return failure(status, error instanceof Error ? error.message : String(error))
  }
}
