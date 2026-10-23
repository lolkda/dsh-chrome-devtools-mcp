import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildNpxArgs, npxCommand, parseLauncherArgs, resolveSpec } from '../lib/launch.js'

test('latest state resolves to the latest dist-tag', () => {
  assert.equal(resolveSpec({ mode: 'latest', version: null }), 'chrome-devtools-mcp@latest')
  assert.deepEqual(buildNpxArgs({ mode: 'latest', version: null }, ['--browser-url=http://127.0.0.1:9222']), [
    '-y',
    'chrome-devtools-mcp@latest',
    '--browser-url=http://127.0.0.1:9222',
  ])
})

test('pinned state resolves to an exact version', () => {
  assert.equal(resolveSpec({ mode: 'pinned', version: '1.12.0' }), 'chrome-devtools-mcp@1.12.0')
})

test('malformed state falls back to latest', () => {
  assert.equal(resolveSpec(undefined), 'chrome-devtools-mcp@latest')
  assert.equal(resolveSpec({ mode: 'pinned', version: '../../evil' }), 'chrome-devtools-mcp@latest')
})

test('npx command is platform-aware', () => {
  assert.equal(npxCommand('linux'), 'npx')
  assert.equal(npxCommand('win32'), 'npx.cmd')
})

test('launcher strips the private DSH home argument before npx', () => {
  const parsed = parseLauncherArgs(['--dsh-home', '/tmp/dsh', '--browser-url=http://127.0.0.1:9222'], {})
  assert.equal(parsed.dshHome, '/tmp/dsh')
  assert.deepEqual(parsed.passthrough, ['--browser-url=http://127.0.0.1:9222'])
})

test('launcher rejects a missing DSH home value', () => {
  assert.throws(() => parseLauncherArgs(['--dsh-home', '--browser-url=x'], {}), /缺少目录参数/)
})

