import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import bcrypt from 'bcryptjs'
import { purgeExpiredDemos } from '../services/demo.js'
import { accountForGoogle } from '../services/googleAuth.js'
import { client, useTestServer } from '../test/helpers.js'

useTestServer()

describe('sign-in options', () => {
  it('reports which providers are switched on', async () => {
    const providers = await client()('GET', '/auth/providers')
    assert.equal(providers.status, 200)
    assert.deepEqual(Object.keys(providers.body).sort(), ['apple', 'google'])
    assert.equal(providers.body.apple, null)
  })
})

describe('Google sign-in', () => {
  it('rejects tokens Google did not sign for us', async () => {
    const res = await client()('POST', '/auth/google', { credential: 'eyJhbGciOiJSUzI1NiJ9.not-a-real-google-token.signature' })
    assert.ok([401, 404].includes(res.status), `status ${res.status}`)
    assert.equal((await client()('POST', '/auth/google', {})).status, 400)
  })

  it('creates, links and protects accounts by verified email', async () => {
    const stamp = Date.now()
    const fresh = await accountForGoogle({ sub: `sub-${stamp}`, email: `g-${stamp}@example.com`, emailVerified: true, name: 'Google Person' })
    assert.equal(fresh.isNew, true)
    const created = await prisma.user.findUniqueOrThrow({ where: { id: fresh.userId } })
    assert.deepEqual([created.hasPassword, created.googleSub], [false, `sub-${stamp}`])
    // Signing in again finds the same account.
    assert.deepEqual(await accountForGoogle({ sub: `sub-${stamp}`, email: `g-${stamp}@example.com`, emailVerified: true, name: 'x' }), { userId: fresh.userId, isNew: false })

    // An existing email account is linked, not duplicated.
    const api = client()
    await api('POST', '/auth/register', { name: 'Email First', email: `e-${stamp}@example.com`, password: 'a-long-password' })
    const linked = await accountForGoogle({ sub: `sub2-${stamp}`, email: `e-${stamp}@example.com`, emailVerified: true, name: 'x' })
    assert.equal(linked.isNew, false)
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: linked.userId } })).googleSub, `sub2-${stamp}`)
    // A second Google account can't take over that email, and unverified emails are never linked.
    await assert.rejects(accountForGoogle({ sub: `sub3-${stamp}`, email: `e-${stamp}@example.com`, emailVerified: true, name: 'x' }), /different Google account/)
    await assert.rejects(accountForGoogle({ sub: `sub4-${stamp}`, email: `u-${stamp}@example.com`, emailVerified: false, name: 'x' }), /verify your email/)
  })

  it('lets a Google-only account set its first password without a current one', async () => {
    const stamp = Date.now()
    const { userId } = await accountForGoogle({ sub: `pw-${stamp}`, email: `pw-${stamp}@example.com`, emailVerified: true, name: 'No Password' })
    // Give the test a way in: a known hash while hasPassword stays false, as for a Google-only account.
    const api = client()
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash('temporary-pass-1', 4) } })
    assert.equal((await api('POST', '/auth/login', { email: `pw-${stamp}@example.com`, password: 'temporary-pass-1' })).status, 200)
    assert.equal((await api('GET', '/auth/me')).body.user.hasPassword, false)
    assert.equal((await api('POST', '/auth/password', { newPassword: 'my-own-password' })).status, 204)
    assert.equal((await api('GET', '/auth/me')).body.user.hasPassword, true)
    // From now on the current password is required.
    assert.equal((await api('POST', '/auth/password', { newPassword: 'another-password' })).status, 400)
  })
})

describe('demo kitchen', () => {
  it('signs a visitor into a private, ready-to-use household', async () => {
    const api = client()
    const started = await api('POST', '/auth/demo')
    assert.equal(started.status, 201)
    const me = await api('GET', '/auth/me')
    assert.equal(me.body.user.isDemo, true)
    assert.equal(me.body.household.name, 'Demo kitchen')
    const householdId = me.body.household.id

    const pantry = await api('GET', `/households/${householdId}/pantry`)
    assert.ok(pantry.body.length >= 25)
    const plan = await api('GET', `/households/${householdId}/planner`)
    assert.ok(plan.body.meals.length >= 1)
    assert.ok((await api('GET', `/households/${householdId}/history`)).body.meals.length >= 2)

    // Each visitor gets their own kitchen.
    const other = client()
    await other('POST', '/auth/demo')
    assert.notEqual((await other('GET', '/auth/me')).body.household.id, householdId)
    assert.equal((await other('GET', `/households/${householdId}/pantry`)).status, 404)
  })

  it('ends the session after expiry and deletes everything', async () => {
    const api = client()
    await api('POST', '/auth/demo')
    const me = await api('GET', '/auth/me')
    const householdId = me.body.household.id
    // Cook something so stock transactions and a cooking event exist, which must not block deletion.
    const meal = (await api('GET', `/households/${householdId}/planner`)).body.meals[0]
    await api('POST', `/households/${householdId}/meals/${meal.id}/complete`, { idempotencyKey: crypto.randomUUID(), usage: [] })

    await prisma.user.update({ where: { id: me.body.user.id }, data: { demoExpiresAt: new Date(Date.now() - 1000) } })
    const after = await api('GET', '/auth/me')
    assert.equal(after.status, 401)
    assert.match(after.body.error, /demo kitchen has ended/)

    assert.ok(await purgeExpiredDemos() >= 1)
    assert.equal(await prisma.user.count({ where: { id: me.body.user.id } }), 0)
    assert.equal(await prisma.household.count({ where: { id: householdId } }), 0)
  })
})
