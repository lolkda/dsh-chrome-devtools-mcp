import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { handle, installRoutes, ROUTE_PREFIX } from '../lib/routes.js'
import { readState, writeState } from '../lib/state.js'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

function request(path, init = {}) {
  return new Request(`http://localhost${ROUTE_PREFIX}${path}`, init)
}

test('registers four exact endpoints and returns a disposer', () => {
  const registered = []
  const connection = {
    fetch: {
      register(entry) {
        registered.push(entry)
        return () => {}
      },
    },
  }
  const dispose = installRoutes(connection, {})
  assert.equal(registered.length, 4)
  assert.deepEqual(registered.map((entry) => entry.path).sort(), [
    `${ROUTE_PREFIX}/status`,
    `${ROUTE_PREFIX}/tunnel`,
    `${ROUTE_PREFIX}/version`,
    `${ROUTE_PREFIX}/versions`,
  ])
  assert.equal(typeof dispose, 'function')
})

test('saves latest and rejects a traversal version without touching state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-routes-'))
  try {
    await writeState(home, { mode: 'pinned', version: '1.12.0' })
    const saved = await handle(request('/version', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'latest' }),
    }), { dshHome: home })
    assert.equal(saved.status, 200)
    assert.deepEqual(await readState(home), { mode: 'latest', version: null })

    const rejected = await handle(request('/version', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'pinned', version: '../../evil' }),
    }), { dshHome: home })
    assert.equal(rejected.status, 400)
    assert.deepEqual(await readState(home), { mode: 'latest', version: null })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('status and versions endpoints return JSON envelopes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-routes-'))
  try {
    const fetchImpl = async (url) => {
      if (String(url).includes('api.github.com')) {
        return jsonResponse([{ tag_name: 'v1.12.0', draft: false, prerelease: false, html_url: 'https://example/1.12.0' }])
      }
      if (String(url).includes('/json/version')) return jsonResponse({ Browser: 'Chrome/141.0.0.0' })
      throw new Error(`unexpected ${url}`)
    }
    const status = await handle(request('/status'), { dshHome: home, fetchImpl })
    assert.equal(status.status, 200)
    const statusBody = await status.json()
    assert.equal(statusBody.ok, true)
    assert.equal(statusBody.configured.mode, 'latest')

    const versions = await handle(request('/versions'), { dshHome: home, fetchImpl })
    const versionsBody = await versions.json()
    assert.equal(versionsBody.ok, true)
    assert.equal(versionsBody.latest, '1.12.0')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('tunnel endpoint includes Windows command groups', async () => {
  const response = await handle(request('/tunnel'), { tunnel: { host: '192.168.1.100' } })
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.host, '192.168.1.100')
  assert.ok(Array.isArray(body.windowsClient))
  assert.ok(Array.isArray(body.windowsServer))
})

test('unknown endpoint returns 404', async () => {
  const response = await handle(request('/missing'), {})
  assert.equal(response.status, 404)
})
