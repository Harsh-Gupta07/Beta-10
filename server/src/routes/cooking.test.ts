import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { ingredientId, signUpWithHousehold, useTestServer, type Client } from '../test/helpers.js'

useTestServer()

const recipeId = async (name: string) => (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id

async function setup(name: string) {
  const { api, householdId } = await signUpWithHousehold(name, 4)
  const milk = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 1000, unit: 'ml' })
  const tea = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Tea leaves'), quantity: 100, unit: 'g' })
  const meal = await api('POST', `/households/${householdId}/meals`, { date: localToday('Asia/Kolkata'), slot: 'BREAKFAST', recipeId: await recipeId('Masala Chai') })
  return { api, householdId, milkId: milk.body.id as string, teaId: tea.body.id as string, mealId: meal.body.id as string }
}

const complete = (api: Client, householdId: string, mealId: string, usage: unknown[], key = randomUUID()) =>
  api('POST', `/households/${householdId}/meals/${mealId}/complete`, { idempotencyKey: key, usage })

describe('cooking and stock deduction', () => {
  it('deducts actual usage once and records cooking transactions', async () => {
    const { api, householdId, milkId, teaId, mealId } = await setup('Cook')
    const view = await api('GET', `/households/${householdId}/meals/${mealId}/cooking`)
    assert.equal(view.body.lines.find((l: any) => l.ingredient.name === 'Milk').planned, '400')

    assert.equal((await api('POST', `/households/${householdId}/meals/${mealId}/start`)).body.status, 'COOKING')
    assert.equal((await api('POST', `/households/${householdId}/meals/${mealId}/start`)).status, 200) // idempotent

    // Actual usage differs from the recipe: 450 ml milk, 10 g tea; sugar isn't tracked.
    const done = await complete(api, householdId, mealId, [
      { ingredientId: await ingredientId('Milk'), quantity: 450, unit: 'ml' },
      { ingredientId: await ingredientId('Tea leaves'), quantity: 10, unit: 'g' },
      { ingredientId: await ingredientId('Sugar'), quantity: 20, unit: 'g' },
    ])
    assert.equal(done.status, 201)
    assert.equal(done.body.alreadyCompleted, false)
    assert.ok(done.body.warnings.some((w: string) => w.includes('Sugar')))
    assert.equal(done.body.meal.status, 'COMPLETED')

    const milk = await prisma.pantryItem.findUniqueOrThrow({ where: { id: milkId } })
    assert.equal(milk.quantity.toString(), '550')
    assert.equal((await prisma.pantryItem.findUniqueOrThrow({ where: { id: teaId } })).quantity.toString(), '90')
    const tx = await prisma.stockTransaction.findMany({ where: { pantryItemId: milkId, type: 'COOKING_CONSUMPTION' } })
    assert.deepEqual(tx.map(t => t.delta.toString()), ['-450'])

    // Completed meals no longer reserve stock and can't be changed or cancelled.
    assert.equal((await api('PATCH', `/households/${householdId}/meals/${mealId}`, { servings: 2 })).status, 409)
    assert.equal((await api('POST', `/households/${householdId}/meals/${mealId}/cancel`)).status, 409)
  })

  it('never deducts twice: repeated clicks and simultaneous completions', async () => {
    const { api, householdId, milkId, mealId } = await setup('Twice')
    const usage = [{ ingredientId: await ingredientId('Milk'), quantity: 400, unit: 'ml' }]
    const key = randomUUID()
    // A member double-clicks (same key) while another member completes it too (different key), all at once.
    const results = await Promise.all([complete(api, householdId, mealId, usage, key), complete(api, householdId, mealId, usage, key), complete(api, householdId, mealId, usage), complete(api, householdId, mealId, usage)])
    assert.equal(results.filter(r => r.status === 201).length, 1)
    assert.equal(results.filter(r => r.status === 200 && r.body.alreadyCompleted).length, 3)
    assert.equal((await prisma.pantryItem.findUniqueOrThrow({ where: { id: milkId } })).quantity.toString(), '600')
    assert.equal(await prisma.cookingEvent.count({ where: { plannedMealId: mealId } }), 1)
    assert.equal(await prisma.stockTransaction.count({ where: { pantryItemId: milkId, type: 'COOKING_CONSUMPTION' } }), 1)

    // Trying again later is still a no-op.
    const again = await complete(api, householdId, mealId, usage)
    assert.equal(again.body.alreadyCompleted, true)
    assert.equal((await prisma.pantryItem.findUniqueOrThrow({ where: { id: milkId } })).quantity.toString(), '600')
  })

  it('never goes negative: uses what is recorded and flags the item for a check', async () => {
    const { api, householdId, milkId, mealId } = await setup('Short')
    const done = await complete(api, householdId, mealId, [{ ingredientId: await ingredientId('Milk'), quantity: '1.2', unit: 'l' }])
    assert.equal(done.status, 201)
    assert.ok(done.body.warnings.some((w: string) => w.includes('You used 1.2 L of Milk but only 1 L was recorded')), done.body.warnings.join(' | '))
    const milk = await prisma.pantryItem.findUniqueOrThrow({ where: { id: milkId } })
    assert.deepEqual([milk.quantity.toString(), milk.confidence], ['0', 'CHECK_NEEDED'])
  })

  it('refuses cancelled meals and other households', async () => {
    const { api, householdId, mealId } = await setup('Owner')
    const other = await signUpWithHousehold('Other')
    assert.equal((await complete(other.api, other.householdId, mealId, [])).status, 404)
    assert.equal((await other.api('GET', `/households/${other.householdId}/meals/${mealId}/cooking`)).status, 404)
    await api('POST', `/households/${householdId}/meals/${mealId}/cancel`)
    assert.equal((await complete(api, householdId, mealId, [])).status, 409)
    assert.equal((await api('POST', `/households/${householdId}/meals/${mealId}/start`)).status, 409)
  })

  it('stop returns a cooking meal to planned without touching stock', async () => {
    const { api, householdId, milkId } = await setup('Stopper')
    const later = await api('POST', `/households/${householdId}/meals`, { date: addDays(localToday('Asia/Kolkata'), 1), slot: 'DINNER', recipeId: await recipeId('Masala Chai') })
    await api('POST', `/households/${householdId}/meals/${later.body.id}/start`)
    assert.equal((await api('POST', `/households/${householdId}/meals/${later.body.id}/stop`)).body.status, 'PLANNED')
    assert.equal((await prisma.pantryItem.findUniqueOrThrow({ where: { id: milkId } })).quantity.toString(), '1000')
  })
})
