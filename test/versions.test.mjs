import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  writeReleasesCache,
} from '../lib/state.js'
import {
  assertVersionExists,
  compareVersions,
  fromGithubReleases,
  fromNpmPackument,
  loadVersions,
  normalizeTag,
} from '../lib/versions.js'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

test('tags and versions are normalized and sorted', () => {
  assert.deepEqual(normalizeTag('v1.12.0'), { version: '1.12.0', tag: 'v1.12.0', prerelease: false })
  assert.deepEqual(normalizeTag('1.12.0-beta.1'), { version: '1.12.0', tag: '1.12.0-beta.1', prerelease: true })
  assert.equal(normalizeTag('chrome-devtools-mcp-v1.12.0').version, '1.12.0')
  assert.equal(normalizeTag('not-a-version'), undefined)
  assert.ok(compareVersions('1.12.0', '1.11.9') > 0)
})

test('GitHub releases hide drafts and prereleases and sort descending', () => {
  const result = fromGithubReleases([
    { tag_name: 'v1.11.0', draft: false, prerelease: false, html_url: 'https://example/1.11.0', published_at: '2025-01-01T00:00:00Z' },
    { tag_name: 'v1.12.0', draft: false, prerelease: false, html_url: 'https://example/1.12.0', published_at: '2025-02-01T00:00:00Z' },
    { tag_name: 'v1.13.0-beta.1', draft: false, prerelease: true },
    { tag_name: 'v9.0.0', draft: true, prerelease: false },
  ])
  assert.deepEqual(result.items.map((item) => item.version), ['1.12.0', '1.11.0'])
  assert.equal(result.prereleaseCount, 1)
})

test('GitHub release tags with the project prefix are recognized', () => {
  const result = fromGithubReleases([
    { tag_name: 'chrome-devtools-mcp-v1.12.0', draft: false, prerelease: false, html_url: 'https://example/1.12.0' },
  ])
  assert.equal(result.items[0].version, '1.12.0')
  assert.match(result.items[0].url, /1\.12\.0$/)
})

test('npm packument becomes a stable version list', () => {
  const result = fromNpmPackument({
    versions: {
      '1.10.0': {},
      '1.12.0': {},
      '1.11.0': { deprecated: 'no' },
    },
    time: { '1.12.0': '2025-02-01T00:00:00Z' },
  })
  assert.deepEqual(result.items.map((item) => item.version), ['1.12.0', '1.10.0'])
  assert.equal(result.items[0].publishedAt, '2025-02-01T00:00:00Z')
})

test('loadVersions caches GitHub results and serves them without a network call', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-versions-'))
  try {
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return jsonResponse([
        { tag_name: 'v1.12.0', draft: false, prerelease: false, html_url: 'https://example/1.12.0', published_at: '2025-02-01T00:00:00Z' },
      ])
    }
    const first = await loadVersions({ dshHome: home, fetchImpl, now: Date.now() })
    assert.equal(first.source, 'github')
    assert.equal(first.latest, '1.12.0')
    const second = await loadVersions({ dshHome: home, fetchImpl, now: Date.now() })
    assert.equal(second.source, 'cache')
    assert.equal(second.cached, true)
    assert.equal(second.upstreamSource, 'github')
    assert.equal(calls, 1)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('loadVersions ignores an empty cache left by an older build', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-versions-'))
  try {
    await writeReleasesCache(home, { source: 'github', fetchedAt: new Date().toISOString(), items: [], latest: null })
    const fetchImpl = async () => jsonResponse([
      { tag_name: 'chrome-devtools-mcp-v1.12.0', draft: false, prerelease: false, html_url: 'https://example/1.12.0' },
    ])
    const result = await loadVersions({ dshHome: home, fetchImpl, now: Date.now() })
    assert.equal(result.source, 'github')
    assert.equal(result.latest, '1.12.0')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('loadVersions falls back to npm when GitHub has no recognizable releases', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-versions-'))
  try {
    const fetchImpl = async (url) => {
      if (url.includes('api.github.com')) return jsonResponse([])
      return jsonResponse({ versions: { '1.12.0': {} }, time: { '1.12.0': '2025-02-01T00:00:00Z' } })
    }
    const result = await loadVersions({ dshHome: home, fetchImpl, now: Date.now() })
    assert.equal(result.source, 'npm')
    assert.match(result.warning, /没有可识别/)
    assert.equal(result.latest, '1.12.0')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('loadVersions falls back to npm when GitHub fails', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-versions-'))
  try {
    const fetchImpl = async (url) => {
      if (url.includes('api.github.com')) throw new Error('rate limited')
      return jsonResponse({ versions: { '1.12.0': {} }, time: { '1.12.0': '2025-02-01T00:00:00Z' } })
    }
    const result = await loadVersions({ dshHome: home, fetchImpl, now: Date.now() })
    assert.equal(result.source, 'npm')
    assert.match(result.warning, /rate limited/)
    assert.equal(result.latest, '1.12.0')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('assertVersionExists accepts cached versions and rejects npm 404', async () => {
  await assertVersionExists('1.12.0', { knownVersions: ['1.12.0'], fetchImpl: async () => { throw new Error('should not fetch') } })
  await assert.rejects(
    () => assertVersionExists('9.9.9', { fetchImpl: async () => jsonResponse({}, 404) }),
    /不存在/,
  )
})
