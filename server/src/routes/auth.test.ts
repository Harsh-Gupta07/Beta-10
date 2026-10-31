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

    // An existing email account is linked, not duplicated, but only once its password is given: emails aren't
    // verified at sign-up, so otherwise whoever registered the address first would receive the owner's Google sign-in.
    const api = client()
    await api('POST', '/auth/register', { name: 'Email First', email: `e-${stamp}@example.com`, password: 'a-long-password' })
    const google = { sub: `sub2-${stamp}`, email: `e-${stamp}@example.com`, emailVerified: true, name: 'x' }
    await assert.rejects(accountForGoogle(google), (error: any) => error.status === 409 && error.code === 'PASSWORD_REQUIRED')
    await assert.rejects(accountForGoogle(google, 'not-the-password'), (error: any) => error.status === 401 && error.code === 'PASSWORD_REQUIRED')
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email: google.email } })).googleSub, null)
    const linked = await accountForGoogle(google, 'a-long-password')
    assert.equal(linked.isNew, false)
    // After that, Google alone is enough.
    assert.deepEqual(await accountForGoogle(google), { userId: linked.userId, isNew: false })
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

  it('still deletes a demo whose own recipe copy is planned', async () => {
    const api = client()
    await api('POST', '/auth/demo')
    const me = (await api('GET', '/auth/me')).body
    const householdId = me.household.id
    // A planned meal restricts its recipe; the household's own copy used to make the whole purge fail.
    const shared = (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name: 'Masala Chai' } })).id
    const copy = await api('POST', `/households/${householdId}/recipes/${shared}/duplicate`)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    assert.equal((await api('POST', `/households/${householdId}/meals`, { date: today, slot: 'BREAKFAST', recipeId: copy.body.id })).status, 201)

    await prisma.user.update({ where: { id: me.user.id }, data: { demoExpiresAt: new Date(Date.now() - 1000) } })
    await purgeExpiredDemos()
    assert.equal(await prisma.household.count({ where: { id: householdId } }), 0)
    assert.equal(await prisma.recipe.count({ where: { id: copy.body.id } }), 0)
    // And new visitors can still start a demo.
    assert.equal((await client()('POST', '/auth/demo')).status, 201)
  })

  it('does not let real accounts join a demo kitchen', async () => {
    const api = client()
    await api('POST', '/auth/demo')
    const householdId = (await api('GET', '/auth/me')).body.household.id
    assert.equal((await api('POST', `/households/${householdId}/invite-code`)).status, 403)
    // Even a code made before this rule can't be used.
    await prisma.household.update({ where: { id: householdId }, data: { inviteCode: `DEMO${Date.now() % 10000}` } })
    const code = (await prisma.household.findUniqueOrThrow({ where: { id: householdId } })).inviteCode!
    const visitor = client()
    await visitor('POST', '/auth/register', { name: 'Visitor', email: `visitor-${Date.now()}@example.com`, password: 'a-long-password' })
    assert.equal((await visitor('POST', '/households/join', { code })).status, 404)
  })

  it('shares one assistant budget between all demo kitchens on a network', async () => {
    let sent = 0
    let last = 0
    // Each demo only sends a few messages, so the per-user limit never applies; the shared demo budget must.
    for (let demo = 0; demo < 5 && last !== 429; demo++) {
      const api = client()
      await api('POST', '/auth/demo')
      const householdId = (await api('GET', '/auth/me')).body.household.id
      for (let i = 0; i < 5 && last !== 429; i++) {
        last = (await api('POST', `/households/${householdId}/assistant/messages`, { message: 'What can I cook today?' })).status
        if (last === 200) sent++
      }
    }
    assert.equal(last, 429)
    assert.equal(sent, 20)
  })
})
