/** Commands shown by the settings page. They are generated, never executed. */

import { networkInterfaces } from 'node:os'

export const DEFAULT_SSH_PORT = 22
export const DEFAULT_CDP_PORT = 9222

/** The first non-loopback IPv4 address, used when the browser is opened on localhost. */
export function defaultHost() {
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const family = entry.family === 4 || entry.family === 'IPv4'
      if (family && !entry.internal && entry.address) return entry.address
    }
  }
  return '127.0.0.1'
}

function cleanToken(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || /[\s"'`$\\]/.test(text)) throw new Error(`${label}包含不允许的字符`)
  return text
}

export function buildSshCommand({
  host,
  user = '<user>',
  sshPort = DEFAULT_SSH_PORT,
  remotePort = DEFAULT_CDP_PORT,
  localPort = DEFAULT_CDP_PORT,
} = {}) {
  const target = cleanToken(host, '主机地址')
  const account = cleanToken(user, 'SSH 用户名')
  const port = Number(sshPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 端口无效')
  const remote = Number(remotePort)
  const local = Number(localPort)
  if (!Number.isInteger(remote) || remote < 1 || remote > 65535 || !Number.isInteger(local) || local < 1 || local > 65535) {
    throw new Error('转发端口无效')
  }
  const portArgument = port === DEFAULT_SSH_PORT ? '' : ` -p ${port}`
  return `ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes${portArgument} -R ${remote}:127.0.0.1:${local} ${account}@${target}`
}

export const WINDOWS_OPENSSH_CLIENT = Object.freeze([
  {
    label: '检查 OpenSSH Client',
    command: "Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'",
  },
  {
    label: '安装 OpenSSH Client',
    command: 'Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0',
  },
])

export const WINDOWS_OPENSSH_SERVER = Object.freeze([
  {
    label: '检查 OpenSSH Server',
    command: "Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'",
  },
  {
    label: '安装 OpenSSH Server',
    command: 'Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0',
  },
  {
    label: '启动并设为开机自启',
    command: 'Start-Service sshd\nSet-Service -Name sshd -StartupType Automatic',
  },
  {
    label: '放行 22 端口',
    command: "New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22",
  },
])

export function tunnelInfo({ host = defaultHost(), sshPort = DEFAULT_SSH_PORT, remotePort = DEFAULT_CDP_PORT, localPort = DEFAULT_CDP_PORT } = {}) {
  return {
    host,
    sshPort,
    remotePort,
    localPort,
    commandTemplate: buildSshCommand({ host, user: '<user>', sshPort, remotePort, localPort }),
    windowsClient: WINDOWS_OPENSSH_CLIENT,
    windowsServer: WINDOWS_OPENSSH_SERVER,
  }
}
