/**
 * Upstream release discovery.
 *
 * GitHub Releases are the user-facing source of truth; the npm registry is the
 * fallback because that is what `npx` will actually resolve. Both are cached so
 * a rate-limited GitHub API never leaves the settings page blank.
 */

import { readReleasesCache, writeReleasesCache } from './state.js'

export const GITHUB_REPO = 'ChromeDevTools/chrome-devtools-mcp'
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=40`
export const NPM_PACKUMENT_URL = 'https://registry.npmjs.org/chrome-devtools-mcp'
export const RELEASE_URL_PREFIX = `https://github.com/${GITHUB_REPO}/releases/tag`
export const CACHE_TTL_MS = 10 * 60 * 1000
const USER_AGENT = 'dsh-chrome-devtools-mcp/0.3.0'

export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value))
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/** Strip a leading `v` or the project's release prefix and split a SemVer tag. */
export function normalizeTag(value) {
  if (typeof value !== 'string') return undefined
  const tag = value.trim()
  const match = /^(?:chrome-devtools-mcp-)?v?(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag)
  if (!match) return undefined
  return {
    version: match[1],
    tag,
    prerelease: match[2] !== undefined,
  }
}

export function sortVersionsDescending(items) {
  return [...items].sort((left, right) => compareVersions(right.version, left.version))
}

export function fromGithubReleases(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub Releases 响应格式错误')
  const byVersion = new Map()
  let prereleaseCount = 0
  for (const release of releases) {
    if (!release || release.draft === true) continue
    const parsed = normalizeTag(release.tag_name)
    if (!parsed) continue
    if (parsed.prerelease || release.prerelease === true) {
      prereleaseCount += 1
      continue
    }
    const item = {
      version: parsed.version,
      tag: parsed.tag,
      url: typeof release.html_url === 'string' ? release.html_url : `${RELEASE_URL_PREFIX}/${parsed.tag}`,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      prerelease: false,
    }
    const previous = byVersion.get(item.version)
    if (!previous || String(item.publishedAt ?? '') > String(previous.publishedAt ?? '')) byVersion.set(item.version, item)
  }
  return { items: sortVersionsDescending([...byVersion.values()]), prereleaseCount }
}

export function fromNpmPackument(packument) {
  if (!packument || typeof packument !== 'object' || !packument.versions) {
    throw new Error('npm 版本列表响应格式错误')
  }
  const times = packument.time && typeof packument.time === 'object' ? packument.time : {}
  const items = []
  for (const [version, metadata] of Object.entries(packument.versions)) {
    if (!parseVersion(version)) continue
    if (metadata && metadata.deprecated) continue
    items.push({
      version,
      tag: `v${version}`,
      url: `${RELEASE_URL_PREFIX}/v${version}`,
      publishedAt: typeof times[version] === 'string' ? times[version] : null,
      prerelease: false,
    })
  }
  return { items: sortVersionsDescending(items), prereleaseCount: 0 }
}

async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json, application/json',
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`GET ${url} 失败：HTTP ${response.status}`)
  return response.json()
}

export async function fetchGithubVersions(options = {}) {
  const releases = await fetchJson(GITHUB_RELEASES_URL, options)
  return fromGithubReleases(releases)
}

export async function fetchNpmVersions(options = {}) {
  const packument = await fetchJson(NPM_PACKUMENT_URL, options)
  return fromNpmPackument(packument)
}

function responseOf(source, result, fetchedAt, cached, warning) {
  return {
    source,
    cached,
    fetchedAt,
    latest: result.items[0]?.version ?? null,
    items: result.items,
    prereleaseCount: result.prereleaseCount ?? 0,
    ...(warning ? { warning } : {}),
  }
}

/**
 * Resolve the version list, preferring a fresh cache, then GitHub, then npm.
 * A stale cache is still better than an empty selector when both networks fail.
 */
export async function loadVersions({ dshHome, refresh = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const stored = await readReleasesCache(dshHome)
  const cache = stored && Array.isArray(stored.items) && stored.items.length > 0 ? stored : undefined
  const cachedAt = cache && typeof cache.fetchedAt === 'string' ? Date.parse(cache.fetchedAt) : NaN
  const fresh = Number.isFinite(cachedAt) && now - cachedAt < CACHE_TTL_MS
  if (!refresh && fresh && cache) {
    return {
      ...responseOf('cache', { items: cache.items, prereleaseCount: cache.prereleaseCount }, cache.fetchedAt, true, undefined),
      upstreamSource: cache.source,
    }
  }

  let warning
  let result
  let source
  try {
    result = await fetchGithubVersions({ fetchImpl, timeoutMs: 6000 })
    if (result.items.length === 0) throw new Error('GitHub Releases 中没有可识别的稳定版本')
    source = 'github'
  } catch (githubError) {
    warning = `GitHub 版本列表不可用：${githubError.message}`
    try {
      result = await fetchNpmVersions({ fetchImpl, timeoutMs: 8000 })
      source = 'npm'
    } catch (npmError) {
      if (cache) {
        return {
          ...responseOf('cache', { items: cache.items, prereleaseCount: cache.prereleaseCount }, cache.fetchedAt ?? null, true, `${warning}；npm 回退也失败：${npmError.message}；使用缓存`),
          upstreamSource: cache.source,
        }
      }
      throw new Error(`${warning}；npm 回退也失败：${npmError.message}`)
    }
  }

  const fetchedAt = new Date(now).toISOString()
  const payload = responseOf(source, result, fetchedAt, false, warning)
  await writeReleasesCache(dshHome, { ...payload, source }).catch(() => {})
  return payload
}

/** Verify an uncached manual version against npm before writing it. */
export async function assertVersionExists(version, { fetchImpl = fetch, knownVersions = [], timeoutMs = 5000 } = {}) {
  if (!parseVersion(version)) throw new Error('版本必须是 x.y.z 形式')
  if (knownVersions.includes(version)) return
  const response = await fetchImpl(`${NPM_PACKUMENT_URL}/${encodeURIComponent(version)}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status === 404) throw new Error(`版本 ${version} 不存在于 npm`)
  if (!response.ok) throw new Error(`无法验证版本 ${version}：HTTP ${response.status}`)
}

/** The stable versions from the last cache, used when a manual version is saved. */
export async function cachedVersionNames(dshHome) {
  const cache = await readReleasesCache(dshHome)
  return Array.isArray(cache?.items) ? cache.items.map((item) => item.version).filter((version) => parseVersion(version)) : []
}
