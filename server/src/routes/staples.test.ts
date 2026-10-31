import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('staples template', () => {
  it('lists Indian staples with typical amounts, common ones pre-ticked', async () => {
    const { api, householdId } = await signUpWithHousehold('Staples')
    const { status, body } = await api('GET', `/households/${householdId}/pantry/staples`)
    assert.equal(status, 200)
    assert.ok(body.length >= 40)
    const atta = body.find((s: any) => s.ingredient.name === 'Wheat flour (atta)')
    assert.deepEqual([atta.suggested, atta.common, atta.inPantry], [{ quantity: '5', unit: 'kg' }, true, false])
    assert.equal(body.find((s: any) => s.ingredient.name === 'Rajma').common, false)
  })

  it('adds ticked staples as Estimated and skips what is already there', async () => {
    const { api, householdId } = await signUpWithHousehold('Filler')
    const milk = await ingredientId('Milk')
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: milk, quantity: 2, unit: 'l', confidence: 'CONFIRMED' })

    const added = await api('POST', `/households/${householdId}/pantry/staples`, { items: [
      { ingredientId: await ingredientId('Wheat flour (atta)'), quantity: '5', unit: 'kg' },
      { ingredientId: await ingredientId('Toor dal'), quantity: 750, unit: 'g' },
      { ingredientId: milk, quantity: '1', unit: 'l' },
    ] })
    assert.deepEqual([added.status, added.body], [201, { added: 2, skipped: 1 }])

    const pantry = (await api('GET', `/households/${householdId}/pantry`)).body
    const byName = (name: string) => pantry.find((p: any) => p.ingredient.name === name)
    assert.deepEqual([byName('Wheat flour (atta)').quantity, byName('Wheat flour (atta)').confidence], ['5000', 'ESTIMATED'])
    assert.equal(byName('Toor dal').quantity, '750')
    // The existing milk was not overwritten.
    assert.deepEqual([byName('Milk').quantity, byName('Milk').confidence], ['2000', 'CONFIRMED'])
    assert.equal((await api('GET', `/households/${householdId}/pantry/staples`)).body.find((s: any) => s.ingredient.name === 'Toor dal').inPantry, true)
  })

  it('validates the request and keeps households apart', async () => {
    const { api, householdId } = await signUpWithHousehold('Strict')
    assert.equal((await api('POST', `/households/${householdId}/pantry/staples`, { items: [] })).status, 400)
    const rice = await ingredientId('Rice')
    assert.equal((await api('POST', `/households/${householdId}/pantry/staples`, { items: [{ ingredientId: rice, quantity: 1, unit: 'kg' }, { ingredientId: rice, quantity: 2, unit: 'kg' }] })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/pantry/staples`, { items: [{ ingredientId: rice, quantity: 1, unit: 'cups' }] })).status, 400)
    const other = await signUpWithHousehold('Other')
    assert.equal((await other.api('GET', `/households/${householdId}/pantry/staples`)).status, 404)
  })
})

describe('staples order', () => {
  it('groups grains first and fruits last', async () => {
    const { api, householdId } = await signUpWithHousehold('Order')
    const categories = [...new Set((await api('GET', `/households/${householdId}/pantry/staples`)).body.map((s: any) => s.ingredient.category))]
    assert.deepEqual([categories[0], categories[1], categories.at(-1)], ['Grains & Flours', 'Pulses', 'Fruits'])
  })
})
