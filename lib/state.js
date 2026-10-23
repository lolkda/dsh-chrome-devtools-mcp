/**
 * Persistent plugin state.
 *
 * The launcher and the Host half share one small JSON contract. Everything the
 * browser can change lives here; the profile patch stays static and owns the
 * entry id only.
 */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_STATE = Object.freeze({ mode: 'latest', version: null })

/** A version is a plain release SemVer without a `v` prefix. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

/** Resolve the DSH home the same way the Host does, with an explicit override for tests. */
export function resolveDshHome(env = process.env) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return configured || join(homedir(), '.dsh')
}

/** The single directory this plugin owns under DSH_HOME. */
export function stateDir(dshHome = resolveDshHome()) {
  return join(dshHome, 'dsh-chrome-devtools-mcp')
}

export function filePaths(dshHome = resolveDshHome()) {
  const dir = stateDir(dshHome)
  return {
    dir,
    state: join(dir, 'state.json'),
    runtime: join(dir, 'runtime.json'),
    cache: join(dir, 'releases-cache.json'),
  }
}

/** A selection is valid only when it is `latest` or a plain release version. */
export function normalizeSelection(value) {
  if (!value || typeof value !== 'object') throw new Error('版本选择必须是对象')
  if (value.mode === 'latest') return { mode: 'latest', version: null }
  if (value.mode === 'pinned') {
    if (typeof value.version !== 'string' || !VERSION_PATTERN.test(value.version)) {
      throw new Error('固定版本必须是 x.y.z 形式')
    }
    return { mode: 'pinned', version: value.version }
  }
  throw new Error('模式必须是 latest 或 pinned')
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600).catch(() => {})
}

/** Read the selected version, falling back to `latest` for a missing or malformed file. */
export async function readState(dshHome) {
  const paths = filePaths(dshHome)
  let raw
  try {
    raw = await readJson(paths.state)
  } catch (error) {
    return { ...DEFAULT_STATE, warning: `读取状态失败：${error.message}` }
  }
  if (raw === undefined) return { ...DEFAULT_STATE }
  try {
    return normalizeSelection(raw)
  } catch (error) {
    return { ...DEFAULT_STATE, warning: `状态文件无效：${error.message}` }
  }
}

/** Validate, then write the selection. Invalid input never touches the existing file. */
export async function writeState(dshHome, selection) {
  const normalized = normalizeSelection(selection)
  await writeJsonAtomic(filePaths(dshHome).state, {
    ...normalized,
    updatedAt: new Date().toISOString(),
  })
  return normalized
}

/** Read the launcher's runtime record. Missing or malformed records simply mean "unknown". */
export async function readRuntime(dshHome) {
  const paths = filePaths(dshHome)
  try {
    const raw = await readJson(paths.runtime)
    if (!raw || typeof raw !== 'object') return undefined
    const pid = Number(raw.pid)
    if (!Number.isSafeInteger(pid) || pid <= 0) return undefined
    return {
      pid,
      spec: typeof raw.spec === 'string' ? raw.spec : undefined,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
      endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : undefined,
      exitCode: Number.isInteger(raw.exitCode) ? raw.exitCode : undefined,
    }
  } catch {
    return undefined
  }
}

/** The launcher writes this before it spawns npx, and again when the child exits. */
export async function writeRuntime(dshHome, runtime) {
  await writeJsonAtomic(filePaths(dshHome).runtime, runtime)
}

export async function readReleasesCache(dshHome) {
  const paths = filePaths(dshHome)
  try {
    return await readJson(paths.cache)
  } catch {
    return undefined
  }
}

export async function writeReleasesCache(dshHome, cache) {
  await writeJsonAtomic(filePaths(dshHome).cache, cache)
}
