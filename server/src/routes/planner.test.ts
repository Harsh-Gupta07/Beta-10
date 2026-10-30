import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { ingredientId, signUpWithHousehold, useTestServer, type Client } from '../test/helpers.js'

useTestServer()

const today = () => localToday('Asia/Kolkata')
const recipeId = async (name: string) => (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id

async function week(api: Client, householdId: string, date?: string) {
  const res = await api('GET', `/households/${householdId}/planner${date ? `?week=${date}` : ''}`)
  assert.equal(res.status, 200)
  return res.body
}
const stockOf = (body: any, name: string) => body.stock.find((s: any) => s.ingredient.name === name)
const lineOf = (meal: any, name: string) => meal.lines.find((l: any) => l.ingredient.name === name)

describe('meal planner and allocation', () => {
  it('runs the spec milk journey: plan, allocate, detect shortage, cancel, recalculate', async () => {
    const { api, householdId } = await signUpWithHousehold('Neha', 4)
    const day = addDays(today(), 1)
    const chai = await recipeId('Masala Chai') // 400 ml milk for 4 servings

    // 1–2. Household with 1000 ml milk.
    const milk = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 1, unit: 'l', confidence: 'CONFIRMED' })
    // 3–4. Breakfast needs 400 ml, lunch (5 servings) needs 500 ml.
    const breakfast = await api('POST', `/households/${householdId}/meals`, { date: day, slot: 'BREAKFAST', recipeId: chai })
    assert.equal(breakfast.status, 201)
    const lunch = await api('POST', `/households/${householdId}/meals`, { date: day, slot: 'LUNCH', recipeId: chai, servings: 5 })
    assert.equal(lunch.status, 201)

    // 5. 100 ml remains unallocated, no milk shortage, and planning deducted nothing.
    let plan = await week(api, householdId, day)
    let position = stockOf(plan, 'Milk')
    assert.deepEqual([position.onHand, position.required, position.allocated, position.unallocated, position.shortage], ['1000', '900', '900', '100', '0'])
    assert.equal((await prisma.pantryItem.findUniqueOrThrow({ where: { id: milk.body.id } })).quantity.toString(), '1000')

    // 6–7. Unexpected use of 300 ml creates a 200 ml shortage on the later meal.
    await api('POST', `/households/${householdId}/pantry/${milk.body.id}/use`, { quantity: 300, unit: 'ml' })
    plan = await week(api, householdId, day)
    position = stockOf(plan, 'Milk')
    assert.deepEqual([position.onHand, position.allocated, position.unallocated, position.shortage], ['700', '700', '0', '200'])
    const milkShortage = plan.shortages.find((s: any) => s.ingredient.name === 'Milk')
    assert.equal(milkShortage.shortage, '200')
    assert.deepEqual([milkShortage.firstAffected.mealId, milkShortage.firstAffected.date, milkShortage.firstAffected.slot], [lunch.body.id, day, 'LUNCH'])
    const lunchMeal = plan.meals.find((m: any) => m.id === lunch.body.id)
    assert.deepEqual([lineOf(lunchMeal, 'Milk').required, lineOf(lunchMeal, 'Milk').allocated, lineOf(lunchMeal, 'Milk').shortage], ['500', '300', '200'])
    assert.equal(lineOf(plan.meals.find((m: any) => m.id === breakfast.body.id), 'Milk').shortage, '0')

    // 8–9. Reducing servings, then cancelling, recalculates immediately and releases the reservation.
    await api('PATCH', `/households/${householdId}/meals/${lunch.body.id}`, { servings: 3 })
    assert.equal(stockOf(await week(api, householdId, day), 'Milk').shortage, '0')
    assert.equal((await api('POST', `/households/${householdId}/meals/${lunch.body.id}/cancel`)).status, 200)
    plan = await week(api, householdId, day)
    position = stockOf(plan, 'Milk')
    assert.deepEqual([position.allocated, position.unallocated, position.shortage], ['400', '300', '0'])
    const cancelled = plan.meals.find((m: any) => m.id === lunch.body.id)
    assert.deepEqual([cancelled.status, cancelled.reservesStock, lineOf(cancelled, 'Milk').allocated], ['CANCELLED', false, null])

    const shortages = await api('GET', `/households/${householdId}/shortages`)
    assert.ok(!shortages.body.some((s: any) => s.ingredient.name === 'Milk'))
  })

  it('enforces slot rules: no past dates, no double-booking, cancelled slots can be re-planned', async () => {
    const { api, householdId } = await signUpWithHousehold('Vikram', 2)
    const day = addDays(today(), 2)
    const dal = await recipeId('Dal Tadka')
    const poha = await recipeId('Kanda Batata Poha')

    assert.equal((await api('POST', `/households/${householdId}/meals`, { date: addDays(today(), -1), slot: 'DINNER', recipeId: dal })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/meals`, { date: '2026-02-30', slot: 'DINNER', recipeId: dal })).status, 400)

    const first = await api('POST', `/households/${householdId}/meals`, { date: day, slot: 'DINNER', recipeId: dal })
    assert.equal(first.status, 201)
    const clash = await api('POST', `/households/${householdId}/meals`, { date: day, slot: 'DINNER', recipeId: poha })
    assert.equal(clash.status, 409)
    assert.match(clash.body.error, /Dal Tadka/)

    // Default servings come from the household; the recipe scales to them.
    let plan = await week(api, householdId, day)
    const meal = plan.meals.find((m: any) => m.id === first.body.id)
    assert.equal(meal.servings, 2)
    assert.equal(lineOf(meal, 'Toor dal').required, '100')

    // Move to another day and slot, change recipe.
    const target = addDays(day, 1)
    const moved = await api('PATCH', `/households/${householdId}/meals/${first.body.id}`, { date: target, slot: 'LUNCH', recipeId: poha })
    assert.equal(moved.status, 200)
    plan = await week(api, householdId, target)
    const movedMeal = plan.meals.find((m: any) => m.id === first.body.id)
    assert.deepEqual([movedMeal.date, movedMeal.slot, movedMeal.recipe.name], [target, 'LUNCH', 'Kanda Batata Poha'])

    // Cancel, then plan something else in the same slot.
    await api('POST', `/households/${householdId}/meals/${first.body.id}/cancel`)
    assert.equal((await api('PATCH', `/households/${householdId}/meals/${first.body.id}`, { servings: 4 })).status, 409)
    const replacement = await api('POST', `/households/${householdId}/meals`, { date: target, slot: 'LUNCH', recipeId: dal })
    assert.equal(replacement.status, 201)
    assert.equal(await prisma.plannedMeal.count({ where: { id: first.body.id } }), 0)

    // A recipe in use can't be deleted.
    const custom = await api('POST', `/households/${householdId}/recipes`, { name: 'Test khichdi', baseServings: 2, ingredients: [{ ingredientId: await ingredientId('Rice'), quantity: 100 }] })
    await api('POST', `/households/${householdId}/meals`, { date: day, slot: 'BREAKFAST', recipeId: custom.body.id })
    assert.equal((await api('DELETE', `/households/${householdId}/recipes/${custom.body.id}`)).status, 409)
  })

  it("keeps meal plans private to their household", async () => {
    const a = await signUpWithHousehold('Ananya')
    const b = await signUpWithHousehold('Rohan')
    const day = addDays(today(), 1)
    const meal = await a.api('POST', `/households/${a.householdId}/meals`, { date: day, slot: 'DINNER', recipeId: await recipeId('Chole') })
    const secret = await a.api('POST', `/households/${a.householdId}/recipes`, { name: 'Private recipe', baseServings: 2, ingredients: [{ ingredientId: await ingredientId('Rice'), quantity: 100 }] })

    assert.equal((await b.api('GET', `/households/${a.householdId}/planner`)).status, 404)
    assert.equal((await b.api('PATCH', `/households/${b.householdId}/meals/${meal.body.id}`, { servings: 9 })).status, 404)
    assert.equal((await b.api('POST', `/households/${b.householdId}/meals/${meal.body.id}/cancel`)).status, 404)
    assert.equal((await b.api('POST', `/households/${b.householdId}/meals`, { date: day, slot: 'DINNER', recipeId: secret.body.id })).status, 404)
    assert.equal((await week(b.api, b.householdId, day)).meals.length, 0)
    assert.equal((await prisma.plannedMeal.findUniqueOrThrow({ where: { id: meal.body.id } })).servings, 3)
  })
})
