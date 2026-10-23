import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DEFAULT_STATE, filePaths, normalizeSelection, readState, stateDir, writeState } from '../lib/state.js'

async function tempHome() {
  return mkdtemp(join(tmpdir(), 'dsh-chrome-state-'))
}

test('missing state falls back to latest', async () => {
  const home = await tempHome()
  try {
    assert.deepEqual(await readState(home), { ...DEFAULT_STATE })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('state writes and reads pinned and latest selections', async () => {
  const home = await tempHome()
  try {
    assert.deepEqual(await writeState(home, { mode: 'pinned', version: '1.12.0' }), {
      mode: 'pinned',
      version: '1.12.0',
    })
    assert.deepEqual(await readState(home), { mode: 'pinned', version: '1.12.0' })

    await writeState(home, { mode: 'latest' })
    assert.deepEqual(await readState(home), { mode: 'latest', version: null })

    const raw = JSON.parse(await readFile(filePaths(home).state, 'utf8'))
    assert.equal(raw.mode, 'latest')
    assert.equal(raw.version, null)
    assert.ok(raw.updatedAt)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('invalid selections are rejected without touching the existing file', async () => {
  const home = await tempHome()
  try {
    await writeState(home, { mode: 'pinned', version: '1.12.0' })
    await assert.rejects(() => writeState(home, { mode: 'pinned', version: '../../evil' }), /x\.y\.z/)
    assert.deepEqual(await readState(home), { mode: 'pinned', version: '1.12.0' })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('malformed state falls back to latest with a warning', async () => {
  const home = await tempHome()
  try {
    await mkdir(filePaths(home).dir, { recursive: true })
    await writeFile(filePaths(home).state, '{not-json', 'utf8')
    const state = await readState(home)
    assert.equal(state.mode, 'latest')
    assert.match(state.warning, /读取状态失败/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('state directory is under the plugin-owned DSH directory', () => {
  assert.equal(stateDir('/tmp/dsh-home'), '/tmp/dsh-home/dsh-chrome-devtools-mcp')
  assert.equal(normalizeSelection({ mode: 'latest' }).version, null)
})
