import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkCdp, isPidAlive, normalizeBrowserUrl, getStatus } from '../lib/status.js'
import { writeRuntime, writeState } from '../lib/state.js'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('browser URL defaults and strips trailing slashes', () => {
  assert.equal(normalizeBrowserUrl(undefined), 'http://127.0.0.1:9222')
  assert.equal(normalizeBrowserUrl('http://127.0.0.1:9222/'), 'http://127.0.0.1:9222')
  assert.equal(normalizeBrowserUrl('file:///tmp/x'), 'http://127.0.0.1:9222')
})

test('isPidAlive recognizes the current process and rejects invalid pids', () => {
  assert.equal(isPidAlive(process.pid), true)
  assert.equal(isPidAlive(0), false)
  assert.equal(isPidAlive(Number.MAX_SAFE_INTEGER), false)
})

test('checkCdp reports a reachable browser', async () => {
  const result = await checkCdp('http://127.0.0.1:9222', {
    fetchImpl: async () => jsonResponse({ Browser: 'Chrome/141.0.0.0', 'Protocol-Version': '1.3' }),
  })
  assert.equal(result.reachable, true)
  assert.equal(result.browser, 'Chrome/141.0.0.0')
  assert.equal(result.protocolVersion, '1.3')
})

test('checkCdp reports an unreachable browser without throwing', async () => {
  const result = await checkCdp('http://127.0.0.1:9222', {
    fetchImpl: async () => { throw new Error('ECONNREFUSED') },
  })
  assert.equal(result.reachable, false)
  assert.match(result.error, /ECONNREFUSED/)
})

test('getStatus combines configured, running and CDP state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-status-'))
  try {
    await writeState(home, { mode: 'pinned', version: '1.12.0' })
    await writeRuntime(home, { pid: process.pid, spec: 'chrome-devtools-mcp@1.12.0', startedAt: '2026-10-23T07:40:00.000Z' })
    const status = await getStatus({
      dshHome: home,
      fetchImpl: async () => jsonResponse({ Browser: 'Chrome/141.0.0.0' }),
    })
    assert.deepEqual(status.configured, { mode: 'pinned', version: '1.12.0' })
    assert.equal(status.running.state, 'running')
    assert.equal(status.running.spec, 'chrome-devtools-mcp@1.12.0')
    assert.equal(status.cdp.reachable, true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('getStatus marks a dead runtime record as stopped', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-status-'))
  try {
    await writeState(home, { mode: 'latest' })
    await writeRuntime(home, { pid: 2147483647, spec: 'chrome-devtools-mcp@latest', startedAt: '2026-10-23T07:40:00.000Z' })
    const status = await getStatus({ dshHome: home, fetchImpl: async () => { throw new Error('down') } })
    assert.equal(status.running.state, 'stopped')
    assert.equal(status.cdp.reachable, false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
