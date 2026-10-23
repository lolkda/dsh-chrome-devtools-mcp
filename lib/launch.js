/** Pure launch planning, kept outside bin/ so it can be tested without starting npx. */

import { readState, resolveDshHome, VERSION_PATTERN } from './state.js'

export const MCP_PACKAGE = 'chrome-devtools-mcp'
export function resolveSpec(state) {
  if (state && state.mode === 'pinned' && typeof state.version === 'string' && VERSION_PATTERN.test(state.version)) {
    return `${MCP_PACKAGE}@${state.version}`
  }
  return `${MCP_PACKAGE}@latest`
}

export function npxCommand(platform = process.platform) {
  return platform === 'win32' ? 'npx.cmd' : 'npx'
}

export function buildNpxArgs(state, passthrough = []) {
  return ['-y', resolveSpec(state), ...passthrough]
}

export async function readLaunchState(dshHome = resolveDshHome()) {
  return readState(dshHome)
}

/**
 * The DSH child process may not inherit DSH_HOME, so the patch passes the
 * profile's DSH home explicitly. Strip that private argument before npx sees it.
 */
export function parseLauncherArgs(argv, env = process.env) {
  const passthrough = [...argv]
  let dshHome = resolveDshHome(env)
  const index = passthrough.indexOf('--dsh-home')
  if (index !== -1) {
    const value = passthrough[index + 1]
    if (!value || value.startsWith('-')) throw new Error('--dsh-home 缺少目录参数')
    dshHome = value
    passthrough.splice(index, 2)
  }
  return { dshHome, passthrough }
}

export function runtimeRecord({ pid, spec, startedAt = new Date().toISOString() }) {
  return { pid, spec, startedAt }
}
