import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { client, ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('pantry API', () => {
  it('adds stock in canonical units and records an INITIAL_STOCK transaction', async () => {
    const { api, householdId } = await signUpWithHousehold('Asha')
    const milk = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: '1', unit: 'l', confidence: 'CONFIRMED' })
    assert.equal(milk.status, 201)
    assert.equal(milk.body.quantity, '1000')
    assert.equal(milk.body.unit, 'ml')
    assert.equal(milk.body.confidence, 'CONFIRMED')
    assert.ok(milk.body.lastVerifiedAt)

    const history = await api('GET', `/households/${householdId}/pantry/${milk.body.id}/transactions`)
    assert.deepEqual(history.body.map((t: any) => [t.type, t.delta, t.balanceAfter]), [['INITIAL_STOCK', '1000', '1000']])

    const duplicate = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 1, unit: 'l' })
    assert.equal(duplicate.status, 409)
  })

  it('rejects unsafe unit conversions and invalid input', async () => {
    const { api, householdId } = await signUpWithHousehold('Ravi')
    const rice = await ingredientId('Rice')
    assert.equal((await api('POST', `/households/${householdId}/pantry`, { ingredientId: rice, quantity: 500, unit: 'ml' })).status, 422)
    assert.equal((await api('POST', `/households/${householdId}/pantry`, { ingredientId: rice, quantity: -5, unit: 'g' })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/pantry`, { ingredientId: rice, quantity: 'lots', unit: 'g' })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/pantry`, { ingredientId: 'missing', quantity: 1, unit: 'g' })).status, 404)
    assert.equal((await api('GET', `/households/${householdId}/pantry`)).body.length, 0)
  })

  it('records usage, refuses over-usage, and keeps decimal precision', async () => {
    const { api, householdId } = await signUpWithHousehold('Meera')
    const sugar = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Sugar'), quantity: '0.3', unit: 'kg' })
    const path = `/households/${householdId}/pantry/${sugar.body.id}`
    assert.equal((await api('POST', `${path}/use`, { quantity: '0.1', unit: 'kg' })).body.quantity, '200')
    assert.equal((await api('POST', `${path}/use`, { quantity: '0.1', unit: 'kg' })).body.quantity, '100')
    const over = await api('POST', `${path}/use`, { quantity: 101, unit: 'g' })
    assert.equal(over.status, 409)
    assert.equal((await api('GET', `/households/${householdId}/pantry`)).body[0].quantity, '100')
  })

  it('serializes concurrent usage so stock never goes negative', async () => {
    const { api, householdId } = await signUpWithHousehold('Kabir')
    const oil = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Oil'), quantity: 1000, unit: 'ml' })
    const results = await Promise.all(Array.from({ length: 12 }, () => api('POST', `/households/${householdId}/pantry/${oil.body.id}/use`, { quantity: 100, unit: 'ml' })))
    assert.equal(results.filter(r => r.status === 200).length, 10)
    assert.equal(results.filter(r => r.status === 409).length, 2)
    const item = await prisma.pantryItem.findUniqueOrThrow({ where: { id: oil.body.id } })
    assert.equal(item.quantity.toString(), '0')
    const uses = await prisma.stockTransaction.count({ where: { pantryItemId: oil.body.id, type: 'MANUAL_USE' } })
    assert.equal(uses, 10)
  })

  it('verification corrects stock, confirms confidence and logs the check', async () => {
    const { api, householdId } = await signUpWithHousehold('Nisha')
    const milk = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 800, unit: 'ml', confidence: 'ESTIMATED', lowStockThreshold: 400 })
    const path = `/households/${householdId}/pantry/${milk.body.id}`

    const corrected = await api('POST', `${path}/verify`, { action: 'update', quantity: '0.3', unit: 'l' })
    assert.equal(corrected.status, 200)
    assert.equal(corrected.body.changed, true)
    assert.equal(corrected.body.previousQuantity, '800')
    assert.equal(corrected.body.item.quantity, '300')
    assert.equal(corrected.body.item.confidence, 'CONFIRMED')
    assert.equal(corrected.body.item.status, 'LOW')
    assert.equal(corrected.body.item.source, 'CORRECTION')

    const confirmed = await api('POST', `${path}/verify`, { action: 'confirm' })
    assert.equal(confirmed.body.changed, false)

    const finished = await api('POST', `${path}/verify`, { action: 'finished' })
    assert.equal(finished.body.item.status, 'OUT')

    const checks = await prisma.inventoryVerification.findMany({ where: { pantryItemId: milk.body.id }, orderBy: { verifiedAt: 'asc' } })
    assert.deepEqual(checks.map(c => [c.oldQuantity.toString(), c.newQuantity.toString()]), [['800', '300'], ['300', '300'], ['300', '0']])
    const history = await api('GET', `${path}/transactions`)
    assert.deepEqual(history.body.map((t: any) => [t.type, t.delta]), [['CORRECTION', '-300'], ['CORRECTION', '-500'], ['INITIAL_STOCK', '800']])
  })

  it('edits metadata and quantity, and keeps history after deletion', async () => {
    const { api, householdId } = await signUpWithHousehold('Tara')
    const paneer = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Paneer'), quantity: 200, unit: 'g', expiresAt: '2030-01-05' })
    const path = `/households/${householdId}/pantry/${paneer.body.id}`
    const edited = await api('PATCH', path, { quantity: 250, confidence: 'CHECK_NEEDED', expiresAt: null })
    assert.equal(edited.body.quantity, '250')
    assert.equal(edited.body.confidence, 'CHECK_NEEDED')
    assert.equal(edited.body.expiresAt, null)

    assert.equal((await api('DELETE', path)).status, 204)
    assert.equal((await api('GET', path + '/transactions')).status, 404)
    const kept = await prisma.stockTransaction.findMany({ where: { householdId, ingredient: { nameKey: 'paneer' } }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(kept.map(t => [t.type, t.pantryItemId, t.balanceAfter.toString()]), [['INITIAL_STOCK', null, '200'], ['CORRECTION', null, '250'], ['REMOVED', null, '0']])
  })

  it('scopes custom ingredients to their household', async () => {
    const a = await signUpWithHousehold('Ira')
    const b = await signUpWithHousehold('Dev')
    const custom = await a.api('POST', `/households/${a.householdId}/ingredients`, { name: 'Sambar powder', category: 'Spices', canonicalUnit: 'g' })
    assert.equal(custom.status, 201)
    assert.equal((await a.api('POST', `/households/${a.householdId}/ingredients`, { name: 'sambar POWDER ', canonicalUnit: 'g' })).status, 409)
    assert.equal((await a.api('POST', `/households/${a.householdId}/ingredients`, { name: 'MILK', canonicalUnit: 'ml' })).status, 409)

    const bList = await b.api('GET', `/households/${b.householdId}/ingredients`)
    assert.ok(!bList.body.some((i: any) => i.id === custom.body.id))
    assert.equal((await b.api('POST', `/households/${b.householdId}/pantry`, { ingredientId: custom.body.id, quantity: 50 })).status, 404)
    assert.equal((await b.api('POST', `/households/${b.householdId}/ingredients`, { name: 'Sambar powder', canonicalUnit: 'g' })).status, 201)
  })

  it("blocks access to another household's pantry", async () => {
    const a = await signUpWithHousehold('Owner')
    const b = await signUpWithHousehold('Intruder')
    const item = await a.api('POST', `/households/${a.householdId}/pantry`, { ingredientId: await ingredientId('Onion'), quantity: 1, unit: 'kg' })
    const path = `/households/${a.householdId}/pantry/${item.body.id}`

    assert.equal((await b.api('GET', `/households/${a.householdId}/pantry`)).status, 404)
    assert.equal((await b.api('PATCH', path, { quantity: 1 })).status, 404)
    assert.equal((await b.api('POST', `${path}/use`, { quantity: 1 })).status, 404)
    assert.equal((await b.api('DELETE', path)).status, 404)
    // B's own household route cannot reach A's item either.
    assert.equal((await b.api('PATCH', `/households/${b.householdId}/pantry/${item.body.id}`, { quantity: 1 })).status, 404)
    assert.equal((await client()('GET', `/households/${a.householdId}/pantry`)).status, 401)

    const untouched = await prisma.pantryItem.findUniqueOrThrow({ where: { id: item.body.id } })
    assert.equal(untouched.quantity.toString(), '1000')
  })
})
