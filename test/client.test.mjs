import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

test('client registers a settings section with a stable id and label', () => {
  assert.match(source, /name: 'settings\.section'/)
  assert.match(source, /id: 'dsh-chrome-devtools-mcp'/)
  assert.match(source, /LABEL|Chrome DevTools/)
  assert.match(source, /order: SECTION_ORDER/)
})

test('client requests every host endpoint', () => {
  for (const endpoint of ['/status', '/versions', '/version', '/tunnel']) {
    assert.match(source, new RegExp(endpoint.replace('/', '\\/')))
  }
})

test('client includes a relative Chrome startup command', () => {
  assert.ok(source.includes('.\\\\chrome.exe'))
  assert.ok(source.includes('--remote-debugging-port=9222'))
  assert.ok(source.includes('--user-data-dir'))
  assert.ok(source.includes('--no-first-run'))
  assert.ok(source.includes('--no-default-browser-check'))
  assert.ok(!source.includes('C:\\Program Files\\Google\\Chrome'))
})

test('client does not depend on a UI primitives package', () => {
  assert.doesNotMatch(source, /dsh-client-ui-primitives/)
  assert.doesNotMatch(source, /require\(['"]react-dom/)
})
