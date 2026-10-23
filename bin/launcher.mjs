#!/usr/bin/env node
/**
 * The stable process the MCP client starts. It resolves the selected upstream
 * version at launch, records the runtime PID, and proxies signals to npx.
 */

import { spawn } from 'node:child_process'
import { buildNpxArgs, npxCommand, parseLauncherArgs, readLaunchState, resolveSpec, runtimeRecord } from '../lib/launch.js'
import { writeRuntime } from '../lib/state.js'

let launch
try {
  launch = parseLauncherArgs(process.argv.slice(2))
} catch (error) {
  console.error(`dsh-chrome-devtools-mcp: ${error.message}`)
  process.exit(1)
}
const { dshHome, passthrough } = launch

let state
try {
  state = await readLaunchState(dshHome)
} catch {
  state = { mode: 'latest', version: null }
}
if (state.warning) console.error(`dsh-chrome-devtools-mcp: ${state.warning}`)

const spec = resolveSpec(state)
const startedAt = new Date().toISOString()
const command = npxCommand()
const args = buildNpxArgs(state, passthrough)

try {
  await writeRuntime(dshHome, runtimeRecord({ pid: process.pid, spec, startedAt }))
} catch (error) {
  console.error(`dsh-chrome-devtools-mcp: 无法写入运行状态：${error.message}`)
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})

let forwardedSignal

function forwardSignal(signal) {
  if (forwardedSignal) return
  forwardedSignal = signal
  try {
    child.kill(signal)
  } catch {
    // The child may already have exited.
  }
  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL')
    } catch {
      // The child may already have exited.
    }
    process.exit(1)
  }, 750)
  timer.unref()
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => forwardSignal(signal))
}

child.on('error', async (error) => {
  console.error(`dsh-chrome-devtools-mcp: 无法启动 ${command}: ${error.message}`)
  process.exitCode = 1
  await writeRuntime(dshHome, {
    ...runtimeRecord({ pid: process.pid, spec, startedAt }),
    endedAt: new Date().toISOString(),
    exitCode: 1,
  }).catch(() => {})
})

child.on('exit', async (code) => {
  process.exitCode = code ?? 1
  await writeRuntime(dshHome, {
    ...runtimeRecord({ pid: process.pid, spec, startedAt }),
    endedAt: new Date().toISOString(),
    exitCode: code ?? 1,
  }).catch(() => {})
})
