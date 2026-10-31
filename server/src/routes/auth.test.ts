import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { purgeExpiredDemos } from '../services/demo.js'
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
