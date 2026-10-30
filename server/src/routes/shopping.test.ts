import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

const recipeId = async (name: string) => (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id
const milkQty = async (householdId: string) => (await prisma.pantryItem.findFirst({ where: { householdId, ingredient: { nameKey: 'milk' } } }))?.quantity.toString() ?? null

describe('shopping list', () => {
  it('suggests shortages, adds them without duplicates, and only receiving increases stock', async () => {
    const { api, householdId } = await signUpWithHousehold('Shopper', 4)
    const milk = await ingredientId('Milk')
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: milk, quantity: 300, unit: 'ml' })
    await api('POST', `/households/${householdId}/meals`, { date: addDays(localToday('Asia/Kolkata'), 1), slot: 'BREAKFAST', recipeId: await recipeId('Masala Chai'), servings: 7 }) // 700 ml milk

    let list = await api('GET', `/households/${householdId}/shopping`)
    assert.equal(list.body.suggestions.find((s: any) => s.ingredient.name === 'Milk').suggested, '400')

    // Add just milk, twice: the second add finds nothing left to suggest.
    await api('POST', `/households/${householdId}/shopping/add-shortages`, { ingredientIds: [milk] })
    await api('POST', `/households/${householdId}/shopping/add-shortages`, { ingredientIds: [milk] })
    list = await api('GET', `/households/${householdId}/shopping`)
    const milkItems = list.body.items.filter((i: any) => i.name === 'Milk')
    assert.equal(milkItems.length, 1)
    assert.deepEqual([milkItems[0].quantity, milkItems[0].source], ['400', 'SHORTAGE'])
    assert.ok(!list.body.suggestions.some((s: any) => s.ingredient.name === 'Milk'))

    // Adding the same ingredient manually merges into the open line.
    await api('POST', `/households/${householdId}/shopping/items`, { ingredientId: milk, quantity: '0.5', unit: 'l' })
    const merged = (await api('GET', `/households/${householdId}/shopping`)).body.items.filter((i: any) => i.name === 'Milk')
    assert.deepEqual(merged.map((i: any) => i.quantity), ['900'])

    // Purchased is bookkeeping only.
    const itemId = merged[0].id
    assert.equal((await api('PATCH', `/households/${householdId}/shopping/items/${itemId}`, { status: 'PURCHASED' })).body.status, 'PURCHASED')
    assert.equal(await milkQty(householdId), '300')

    // Partial delivery: 0.5 L arrived, remainder stays on the list. Receiving twice changes nothing.
    const received = await api('POST', `/households/${householdId}/shopping/items/${itemId}/receive`, { quantity: '0.5', unit: 'l', keepRemainder: true })
    assert.equal(received.body.alreadyReceived, false)
    assert.equal(received.body.pantryItem.quantity, '800')
    const again = await api('POST', `/households/${householdId}/shopping/items/${itemId}/receive`, { quantity: '0.5', unit: 'l', keepRemainder: true })
    assert.equal(again.body.alreadyReceived, true)
    assert.equal(await milkQty(householdId), '800')
    list = await api('GET', `/households/${householdId}/shopping`)
    assert.deepEqual(list.body.items.filter((i: any) => i.name === 'Milk').map((i: any) => [i.status, i.quantity]), [['NEEDED', '400'], ['RECEIVED', '900']])
    assert.equal(await prisma.stockTransaction.count({ where: { householdId, type: 'PURCHASE_RECEIVED' } }), 1)

    // Received items can't be edited; clearing them keeps stock history.
    assert.equal((await api('PATCH', `/households/${householdId}/shopping/items/${itemId}`, { quantity: 1 })).status, 409)
    assert.equal((await api('POST', `/households/${householdId}/shopping/clear-received`)).body.removed, 1)
  })

  it('creates a pantry item when receiving something not yet tracked, and handles free-text items', async () => {
    const { api, householdId } = await signUpWithHousehold('Newbie')
    const ghee = await api('POST', `/households/${householdId}/shopping/items`, { ingredientId: await ingredientId('Ghee'), quantity: 500, unit: 'ml' })
    assert.equal((await api('POST', `/households/${householdId}/shopping/items`, { ingredientId: await ingredientId('Ghee'), quantity: 1, unit: 'kg' })).status, 422)
    const receive = await api('POST', `/households/${householdId}/shopping/items/${ghee.body.id}/receive`, { quantity: 500, unit: 'ml' })
    assert.deepEqual([receive.body.pantryItem.quantity, receive.body.pantryItem.confidence, receive.body.pantryItem.source], ['500', 'CONFIRMED', 'PURCHASE'])

    const soap = await api('POST', `/households/${householdId}/shopping/items`, { name: 'Dish soap', quantity: 2, unit: 'bottle' })
    assert.deepEqual([soap.status, soap.body.unit, soap.body.ingredient], [201, 'bottle', null])
    assert.equal((await api('POST', `/households/${householdId}/shopping/items/${soap.body.id}/receive`, { quantity: 2 })).body.item.status, 'RECEIVED')
    assert.equal((await api('POST', `/households/${householdId}/shopping/items`, { quantity: 2 })).status, 400)
  })

  it("keeps each household's list private", async () => {
    const a = await signUpWithHousehold('ListA')
    const b = await signUpWithHousehold('ListB')
    const item = await a.api('POST', `/households/${a.householdId}/shopping/items`, { ingredientId: await ingredientId('Rice'), quantity: 1, unit: 'kg' })
    assert.equal((await b.api('PATCH', `/households/${b.householdId}/shopping/items/${item.body.id}`, { status: 'PURCHASED' })).status, 404)
    assert.equal((await b.api('POST', `/households/${b.householdId}/shopping/items/${item.body.id}/receive`, { quantity: 1, unit: 'kg' })).status, 404)
    assert.equal((await b.api('DELETE', `/households/${b.householdId}/shopping/items/${item.body.id}`)).status, 404)
    assert.equal((await b.api('GET', `/households/${a.householdId}/shopping`)).status, 404)
  })
})
