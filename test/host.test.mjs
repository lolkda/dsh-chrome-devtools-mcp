import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../lib/index.js'
import { ROUTE_PREFIX } from '../lib/routes.js'

function fakeConnection() {
  const registered = []
  return {
    registered,
    connection: {
      fetch: {
        register(entry) {
          registered.push(entry)
          return () => {}
        },
      },
    },
  }
}

test('apply installs routes immediately when web services already exist', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-host-'))
  try {
    const { registered, connection } = fakeConnection()
    const ctx = {
      get: (service) => service === 'webServer' ? {} : service === 'connection' ? connection : undefined,
      effect: (fn) => fn(),
    }
    apply(ctx, { dshHome: home })
    assert.equal(registered.length, 4)
    assert.ok(registered.every((entry) => entry.path.startsWith(ROUTE_PREFIX)))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('apply waits for web services with delayed injection', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-host-'))
  try {
    const { registered, connection } = fakeConnection()
    let pending
    const ctx = {
      get: () => undefined,
      effect: (fn) => fn(),
      inject: (services, callback) => {
        assert.deepEqual(services, ['webServer', 'connection'])
        pending = callback
      },
    }
    apply(ctx, { dshHome: home })
    assert.equal(registered.length, 0)
    pending({ get: (service) => service === 'webServer' ? {} : connection })
    assert.equal(registered.length, 4)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('apply degrades instead of throwing without a connection service', () => {
  const ctx = { get: () => undefined }
  assert.doesNotThrow(() => apply(ctx, { dshHome: '/tmp/unused' }))
})
