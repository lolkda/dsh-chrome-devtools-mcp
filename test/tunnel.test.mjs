import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSshCommand,
  defaultHost,
  tunnelInfo,
  WINDOWS_OPENSSH_CLIENT,
  WINDOWS_OPENSSH_SERVER,
} from '../lib/tunnel.js'

test('builds the reverse tunnel command for the default port', () => {
  assert.equal(
    buildSshCommand({ host: '192.168.1.100', user: 'alice' }),
    'ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 9222:127.0.0.1:9222 alice@192.168.1.100',
  )
})

test('adds a non-default SSH port and rejects unsafe tokens', () => {
  assert.match(buildSshCommand({ host: '192.168.1.100', user: 'alice', sshPort: 2222 }), /-p 2222/)
  assert.throws(() => buildSshCommand({ host: 'bad host', user: 'alice' }), /不允许/)
  assert.throws(() => buildSshCommand({ host: '192.168.1.100', user: 'a b' }), /不允许/)
})

test('tunnel info exposes Windows client and server commands', () => {
  const info = tunnelInfo({ host: '192.168.1.100' })
  assert.equal(info.host, '192.168.1.100')
  assert.match(info.commandTemplate, /<user>@192\.168\.1\.100/)
  assert.equal(info.windowsClient.length, WINDOWS_OPENSSH_CLIENT.length)
  assert.equal(info.windowsServer.length, WINDOWS_OPENSSH_SERVER.length)
  assert.match(info.windowsServer.at(-1).command, /New-NetFirewallRule/)
})

test('defaultHost returns a non-empty address', () => {
  assert.match(defaultHost(), /\S/)
})
