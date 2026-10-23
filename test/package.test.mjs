import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const patch = parse(read('cordis.patch.yml'), { logLevel: 'silent' })
const rows = patch.flatMap((layer) => layer.insert ?? [])
const hostRow = rows.find((entry) => entry.id === 'dsh-chrome-devtools-mcp')
const mcpRow = rows.find((entry) => entry.id === 'chrome-devtools-mcp')

test('source package is a DSH bundle with a web client', () => {
  assert.equal(pkg.name, '@lolkda/dsh-chrome-devtools-mcp')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
  assert.equal(lock.version, pkg.version)
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh?.client?.platform, 'web')
  assert.deepEqual(pkg.dsh?.client?.inject, ['@deepseek-ai/dsh-client-ui-settings'])
  assert.equal(pkg.exports?.['./client'], './client/client.js')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(pkg.engines?.dsh, '>=0.2.1-rc.2 <0.3.0')
  assert.equal(pkg.chromeDevtoolsMcp?.channel, 'latest')
})

test('published files include both halves, launcher and spec', () => {
  for (const file of ['lib', 'client', 'bin', 'docs', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
    assert.ok(pkg.files.includes(file), `missing ${file}`)
  }
})

test('patch mounts the settings host and the version-aware MCP client', () => {
  assert.ok(hostRow, 'host row is missing')
  assert.equal(hostRow.name, '@lolkda/dsh-chrome-devtools-mcp')

  assert.ok(mcpRow, 'mcp row is missing')
  assert.equal(mcpRow.name, '@deepseek-ai/dsh-mcp-client')
  assert.equal(mcpRow.config?.serverName, 'chrome-devtools')
  assert.equal(mcpRow.config?.transport, 'stdio')
  assert.equal(mcpRow.config?.command, 'process.execPath')
  assert.match(mcpRow.config.args[0], /bin\/launcher\.mjs/)
  assert.match(mcpRow.config.args[0], /baseUrl/)
  assert.equal(mcpRow.config.args[1], '--dsh-home')
  assert.match(mcpRow.config.args[2], /process\.env\.DSH_HOME/)
  assert.match(mcpRow.config.args[2], /baseUrl/)
  assert.deepEqual(mcpRow.config.args.slice(3), ['--browser-url=http://127.0.0.1:9222', '--no-usage-statistics'])
  assert.equal(mcpRow.config?.failOnStartupError, false)
  assert.equal(mcpRow.config?.toolCallTimeoutMs, 120000)
})

test('patch does not hard-code npm latest or a platform path', () => {
  assert.doesNotMatch(read('cordis.patch.yml'), /chrome-devtools-mcp@latest/)
  assert.doesNotMatch(read('cordis.patch.yml'), /\/usr\/local\/bin/)
})

test('npm pack contains runtime files and no tests', () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const [pack] = JSON.parse(output)
  const files = pack.files.map((file) => file.path)

  for (const expected of [
    'package.json',
    'cordis.patch.yml',
    'lib/index.js',
    'lib/routes.js',
    'client/client.js',
    'bin/launcher.mjs',
    'docs/specs/chrome-devtools-settings.md',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
  ]) {
    assert.ok(files.includes(expected), `${expected} is missing from npm pack`)
  }
  assert.ok(!files.some((file) => file.startsWith('test/')), 'tests must not be published')
})
