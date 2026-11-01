import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('food scans', () => {
  it('does not replace an uploaded photo with demo results when Gemini is not configured', async t => {
    if (env.AI_API_KEY) {
      t.skip('Avoids sending test images to a configured Gemini account.')
      return
    }
    const { api } = await signUpWithHousehold('PhotoNeedsKey')
    const { body: { user } } = await api('GET', '/auth/me')
    await prisma.subscriptionEntitlement.upsert({
      where: { userId: user.id },
      update: { plan: 'PREMIUM', status: 'ACTIVE' },
      create: { userId: user.id, plan: 'PREMIUM', status: 'ACTIVE' },
    })
    const response = await api('POST', '/scans', {
      scanType: 'GROCERY',
      image: { mimeType: 'image/png', base64: 'A'.repeat(1_100_000) },
    })
    assert.equal(response.status, 503)
    assert.equal(response.body.code, 'FOOD_VISION_NOT_CONFIGURED')
  })

  it('adds reviewed grocery scans to the shopping list without receiving pantry stock', async () => {
    const { api, householdId } = await signUpWithHousehold('PhotoShoppingList')
    const { body: { user } } = await api('GET', '/auth/me')
    await prisma.subscriptionEntitlement.upsert({
      where: { userId: user.id },
      update: { plan: 'PREMIUM', status: 'ACTIVE' },
      create: { userId: user.id, plan: 'PREMIUM', status: 'ACTIVE' },
    })

    const scan = await api('POST', '/scans', { scanType: 'GROCERY' })
    assert.equal(scan.status, 201)
    const tomato = scan.body.rawProposal.items.find((item: { name: string }) => item.name === 'Tomato')
    const response = await api('POST', `/scans/${scan.body.id}/confirm`, {
      destination: 'SHOPPING_LIST',
      items: [
        { ingredientId: await ingredientId('Milk'), name: 'Milk', quantity: 1000, unit: 'ml' },
        { ingredientId: tomato.ingredientId, name: 'Tomato', quantity: 500, unit: 'g' },
        { name: 'Dragonfruit', quantity: 2, unit: 'count' },
      ],
    })
    assert.equal(response.status, 200)

    const list = await api('GET', `/households/${householdId}/shopping`)
    const itemsByName = new Map(list.body.items.map((item: { name: string; status: string; source: string }) => [item.name, [item.status, item.source]]))
    assert.deepEqual([...itemsByName.entries()].sort(), [
      ['Dragonfruit', ['NEEDED', 'ASSISTANT']],
      ['Milk', ['NEEDED', 'ASSISTANT']],
      ['Tomato', ['NEEDED', 'ASSISTANT']],
    ])
    assert.equal(await prisma.pantryItem.count({ where: { householdId } }), 0)

    const retried = await api('POST', `/scans/${scan.body.id}/confirm`, {
      destination: 'SHOPPING_LIST',
      items: [{ ingredientId: await ingredientId('Milk'), quantity: 1000, unit: 'ml' }],
    })
    assert.equal(retried.status, 200)
    assert.equal((await api('GET', `/households/${householdId}/shopping`)).body.items.length, 3)
  })
})
