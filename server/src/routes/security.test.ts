import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { client, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('release hardening', () => {
  it('rejects writes from a foreign Origin but allows same-origin and non-browser clients', async () => {
    const api = client()
    const email = `origin-${Date.now()}@example.com`
    assert.equal((await api('POST', '/auth/register', { name: 'Origin', email, password: 'a-long-password' }, { origin: 'https://evil.example' })).status, 403)
    assert.equal((await api('POST', '/auth/register', { name: 'Origin', email, password: 'a-long-password' }, { origin: 'http://localhost:5173' })).status, 201)
    // Reads are never blocked by the origin check.
    assert.equal((await api('GET', '/auth/me', undefined, { origin: 'https://evil.example' })).status, 200)
  })

  it('limits repeated sign-in attempts per email and network', async () => {
    const api = client()
    const email = `brute-${Date.now()}@example.com`
    for (let attempt = 1; attempt <= 10; attempt++) assert.equal((await api('POST', '/auth/login', { email, password: 'wrong-password' })).status, 401, `attempt ${attempt}`)
    const blocked = await api('POST', '/auth/login', { email, password: 'wrong-password' })
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    // A different email from the same network is unaffected.
    assert.equal((await api('POST', '/auth/login', { email: `other-${email}`, password: 'wrong-password' })).status, 401)
  })

  it('caps assistant messages per user', async () => {
    const { api, householdId } = await signUpWithHousehold('Chatty')
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await api('POST', `/households/${householdId}/assistant/messages`, { message: 'What can I cook?', history: [] })).status)
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200))
    assert.equal(statuses[10], 429)
  })

  it('keeps one household per user', async () => {
    const { api } = await signUpWithHousehold('Single')
    const second = await api('POST', '/households', { name: 'Second home', defaultServings: 2 })
    assert.equal(second.status, 409)
    assert.match(second.body.error, /already belong/)
  })

  it('returns 413 for oversized bodies and sends security headers', async () => {
    const api = client()
    const big = await api('POST', '/auth/login', { email: 'x@example.com', password: 'p'.repeat(1_100_000) })
    assert.equal(big.status, 413)
    const health = await api('GET', '/health')
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(health.headers.get('x-frame-options'), 'DENY')
    assert.equal(health.headers.get('x-powered-by'), null)
  })

  it('reports readiness only when the database answers', async () => {
    const ready = await client()('GET', '/health/ready')
    assert.deepEqual([ready.status, ready.body.database], [200, 'ok'])
  })

  it('does not reveal internals in error responses', async () => {
    const api = client()
    const bad = await api('POST', '/auth/login', '{not json' as unknown as object, { rawBody: true })
    assert.equal(bad.status, 400)
    assert.doesNotMatch(JSON.stringify(bad.body), /stack|prisma|at \w+ \(/i)
  })
})

// Last in the file: it uses up this network's sign-in budget, so later sign-ins here would be refused.
describe('password spraying', () => {
  it('limits wrong current-password attempts per account', async () => {
    const { api } = await signUpWithHousehold('Changer')
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await api('POST', '/auth/password', { currentPassword: 'wrong-password', newPassword: 'a-new-long-password' })).status)
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(400))
    assert.equal(statuses[10], 429)
  })

  it('caps sign-in attempts from one network across many emails', async () => {
    const api = client()
    let status = 0
    let attempts = 0
    // One try per email never reaches the per-email limit; the per-network limit must stop it.
    while (status !== 429 && attempts < 60) status = (await api('POST', '/auth/login', { email: `spray-${attempts++}-${Date.now()}@example.com`, password: 'Password123' })).status
    assert.equal(status, 429)
    assert.match((await api('POST', '/auth/login', { email: `fresh-${Date.now()}@example.com`, password: 'Password123' })).body.error, /from this network/)
  })
})
