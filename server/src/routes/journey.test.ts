import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

// The Phase 1 brief's integration journey (section 10, step 5), end to end through the HTTP API.
describe('Phase 1 integration journey', () => {
  it('plan -> allocate -> detect shortage -> shop -> cook -> deduct once -> verify', async () => {
    // 1. Create a household.
    const { api, householdId } = await signUpWithHousehold('Journey', 4)
    const h = `/households/${householdId}`
    const milkStock = async () => (await prisma.pantryItem.findFirstOrThrow({ where: { householdId, ingredient: { nameKey: 'milk' } } })).quantity.toString()
    const milkPosition = async () => (await api('GET', `${h}/planner?week=${day}`)).body.stock.find((s: any) => s.ingredient.name === 'Milk')
    const chai = (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name: 'Masala Chai' } })).id
    const day = localToday('Asia/Kolkata')

    // 2. Add 1000 ml milk.
    const milk = await api('POST', `${h}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 1000, unit: 'ml', confidence: 'CONFIRMED' })
    assert.equal(milk.status, 201)

    // 3–4. Plan breakfast needing 400 ml and another meal needing 500 ml.
    const breakfast = (await api('POST', `${h}/meals`, { date: day, slot: 'BREAKFAST', recipeId: chai, servings: 4 })).body.id
    const dinner = (await api('POST', `${h}/meals`, { date: addDays(day, 1), slot: 'DINNER', recipeId: chai, servings: 5 })).body.id

    // 5. 100 ml remains unallocated.
    let position = await milkPosition()
    assert.deepEqual([position.allocated, position.unallocated, position.shortage], ['900', '100', '0'])

    // 6–7. Unexpected consumption of 300 ml leaves a 200 ml shortage.
    await api('POST', `${h}/pantry/${milk.body.id}/use`, { quantity: 300, unit: 'ml', note: 'Guests' })
    position = await milkPosition()
    assert.deepEqual([position.onHand, position.shortage, position.firstAffected.mealId], ['700', '200', dinner])

    // 8–9. Changing the second meal updates allocation and shopping requirements.
    await api('PATCH', `${h}/meals/${dinner}`, { servings: 6 }) // now 600 ml
    assert.equal((await milkPosition()).shortage, '300')
    let shopping = (await api('GET', `${h}/shopping`)).body
    assert.equal(shopping.suggestions.find((s: any) => s.ingredient.name === 'Milk').suggested, '300')
    await api('POST', `${h}/meals/${dinner}/cancel`)
    assert.deepEqual([(await milkPosition()).allocated, (await milkPosition()).shortage], ['400', '0'])
    shopping = (await api('GET', `${h}/shopping`)).body
    assert.ok(!shopping.suggestions.some((s: any) => s.ingredient.name === 'Milk'))
    assert.equal(await milkStock(), '700') // planning and cancelling never touched stock

    // 10–11. Complete a meal: inventory is deducted once.
    const key = randomUUID()
    const usage = [{ ingredientId: await ingredientId('Milk'), quantity: 400, unit: 'ml' }]
    const done = await api('POST', `${h}/meals/${breakfast}/complete`, { idempotencyKey: key, usage })
    assert.equal(done.status, 201)
    assert.equal(await milkStock(), '300')

    // 12–13. Attempting completion again does not deduct twice.
    const again = await api('POST', `${h}/meals/${breakfast}/complete`, { idempotencyKey: randomUUID(), usage })
    assert.equal(again.body.alreadyCompleted, true)
    assert.equal(await milkStock(), '300')

    // Shop: a purchase only counts once it is confirmed as received.
    await api('POST', `${h}/meals`, { date: addDays(day, 2), slot: 'BREAKFAST', recipeId: chai, servings: 8 }) // 800 ml
    await api('POST', `${h}/shopping/add-shortages`, {})
    const item = (await api('GET', `${h}/shopping`)).body.items.find((i: any) => i.name === 'Milk')
    assert.equal(item.quantity, '500')
    await api('PATCH', `${h}/shopping/items/${item.id}`, { status: 'PURCHASED' })
    assert.equal(await milkStock(), '300')
    await api('POST', `${h}/shopping/items/${item.id}/receive`, { quantity: 500, unit: 'ml' })
    assert.equal(await milkStock(), '800')
    assert.equal((await milkPosition()).shortage, '0')

    // 14–15. Manual correction updates every affected calculation and notifies the household.
    const check = await api('POST', `${h}/pantry/${milk.body.id}/verify`, { action: 'update', quantity: 600, unit: 'ml' })
    assert.equal(check.body.affected.shortage, '200')
    position = await milkPosition()
    assert.deepEqual([position.onHand, position.allocated, position.shortage], ['600', '600', '200'])
    // Two plan-affecting events notified the household: the unexpected use (step 6) and this correction.
    const notifications = (await api('GET', `${h}/notifications`)).body
    assert.equal(notifications.unread, 2)
    assert.deepEqual(notifications.items.map((n: any) => n.body.split('.')[0]), ['Milk was corrected after a stock check', 'Milk use was recorded'])

    // The audit trail tells the whole story.
    const history = (await api('GET', `${h}/pantry/${milk.body.id}/transactions`)).body.map((t: any) => [t.type, t.delta, t.balanceAfter])
    assert.deepEqual(history.reverse(), [
      ['INITIAL_STOCK', '1000', '1000'], ['MANUAL_USE', '-300', '700'], ['COOKING_CONSUMPTION', '-400', '300'],
      ['PURCHASE_RECEIVED', '500', '800'], ['CORRECTION', '-200', '600'],
    ])
  })
})
