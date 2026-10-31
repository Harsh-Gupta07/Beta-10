import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { client, ingredientId, signUpWithHousehold, useTestServer, type Client } from '../test/helpers.js'

useTestServer()

const today = () => localToday('Asia/Kolkata')
const recipeId = async (name: string) => (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id
const names = (body: any) => body.suggestions.map((s: any) => s.recipe.name) as string[]
const suggestion = (body: any, name: string) => body.suggestions.find((s: any) => s.recipe.name === name)

async function twoMemberHousehold(memberName: string) {
  const owner = await signUpWithHousehold('Owner')
  const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
  const member = client()
  await member('POST', '/auth/register', { name: memberName, email: `${memberName.toLowerCase()}-${Date.now()}@example.com`, password: 'a-long-password' })
  assert.equal((await member('POST', '/households/join', { code })).status, 201)
  const memberId = (await member('GET', '/auth/me')).body.user.id as string
  return { owner, member, memberId }
}

const all = (api: Client, householdId: string, query = '') => api('GET', `/households/${householdId}/suggestions?limit=30${query}`)

describe('eating history', () => {
  it('logs past meals without touching stock, and refuses future, duplicate or already planned slots', async () => {
    const { api, householdId } = await signUpWithHousehold('Logger')
    const dal = await recipeId('Dal Tadka')
    const logged = await api('POST', `/households/${householdId}/eaten-logs`, { recipeId: dal, date: addDays(today(), -1), slot: 'DINNER' })
    assert.equal(logged.status, 201)
    assert.equal(await prisma.stockTransaction.count({ where: { householdId } }), 0)

    assert.equal((await api('POST', `/households/${householdId}/eaten-logs`, { recipeId: dal, date: addDays(today(), 1), slot: 'DINNER' })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/eaten-logs`, { recipeId: dal, date: addDays(today(), -1), slot: 'DINNER' })).status, 409)
    await api('POST', `/households/${householdId}/meals`, { date: today(), slot: 'LUNCH', recipeId: await recipeId('Chole') })
    assert.match((await api('POST', `/households/${householdId}/eaten-logs`, { recipeId: dal, date: today(), slot: 'LUNCH' })).body.error, /Mark it as cooked/)

    const history = await api('GET', `/households/${householdId}/history`)
    assert.deepEqual(history.body.dishes.map((d: any) => [d.recipe.name, d.times, d.daysAgo]), [['Dal Tadka', 1, 1]])
    assert.equal((await api('DELETE', `/households/${householdId}/eaten-logs/${logged.body.id}`)).status, 204)
    assert.equal((await api('GET', `/households/${householdId}/history`)).body.meals.length, 0)
  })

  it('counts a cooked meal for everyone except members marked absent', async () => {
    const { owner, member, memberId } = await twoMemberHousehold('Away')
    const { api, householdId } = owner
    const meal = await api('POST', `/households/${householdId}/meals`, { date: today(), slot: 'DINNER', recipeId: await recipeId('Masoor Dal') })
    assert.equal((await api('POST', `/households/${householdId}/meals/${meal.body.id}/complete`, { idempotencyKey: randomUUID(), usage: [] })).status, 201)

    const both = await api('GET', `/households/${householdId}/history`)
    assert.equal(both.body.meals[0].eaters.length, 2)
    const set = await member('PUT', `/households/${householdId}/meals/${meal.body.id}/attendance`, { absentUserIds: [memberId] })
    assert.deepEqual(set.body.members.map((m: any) => m.eating), [true, false])
    assert.equal((await member('GET', `/households/${householdId}/history?scope=me`)).body.meals.length, 0)
    assert.equal((await api('GET', `/households/${householdId}/history?scope=me`)).body.meals.length, 1)
    assert.equal((await api('PUT', `/households/${householdId}/meals/${meal.body.id}/attendance`, { absentUserIds: ['someone-else'] })).status, 400)

    const outsider = await signUpWithHousehold('Outsider')
    assert.equal((await outsider.api('GET', `/households/${outsider.householdId}/meals/${meal.body.id}/attendance`)).status, 404)
  })

  it('does not count meals from before a member joined', async () => {
    const owner = await signUpWithHousehold('Early')
    await owner.api('POST', `/households/${owner.householdId}/eaten-logs`, { recipeId: await recipeId('Chole'), date: addDays(today(), -3), slot: 'LUNCH' })
    const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
    const late = client()
    await late('POST', '/auth/register', { name: 'Late', email: `late-${Date.now()}@example.com`, password: 'a-long-password' })
    await late('POST', '/households/join', { code })
    const history = await late('GET', `/households/${owner.householdId}/history`)
    assert.deepEqual(history.body.meals[0].eaters.map((e: any) => e.name), ['Early'])
    assert.equal((await late('GET', `/households/${owner.householdId}/history?scope=me`)).body.meals.length, 0)
  })
})

describe('suggestions', () => {
  it('ranks recently eaten dishes lower and explains why', async () => {
    const { api, householdId } = await signUpWithHousehold('Ranker')
    const fresh = await all(api, householdId)
    assert.equal(fresh.status, 200)
    assert.equal(fresh.body.hasHistory, false)
    assert.ok(!names(fresh.body).includes('Masala Chai'), 'drinks are not suggested as meals')

    await api('POST', `/households/${householdId}/eaten-logs`, { recipeId: await recipeId('Chole'), date: addDays(today(), -1), slot: 'DINNER' })
    const after = await all(api, householdId)
    assert.equal(after.body.hasHistory, true)
    const chole = suggestion(after.body, 'Chole')
    assert.ok(chole.reasons.some((r: any) => r.text === 'You had this yesterday'))
    assert.equal(names(after.body).at(-1), 'Chole')
  })

  it('never includes dishes that clash with a member, and reports how many were left out', async () => {
    const { owner, member } = await twoMemberHousehold('Allergic')
    await member('PUT', '/me/food-preferences', { allergens: ['MILK'] })
    const { body } = await all(owner.api, owner.householdId)
    assert.ok(!names(body).includes('Palak Paneer'))
    assert.ok(body.excludedForSafety > 0)
    // Just for the owner, who has no allergy, paneer is back.
    assert.ok(names((await all(owner.api, owner.householdId, '&scope=me')).body).includes('Palak Paneer'))
  })

  it('uses unreserved stock, so a planned meal’s ingredients are not offered twice', async () => {
    const { api, householdId } = await signUpWithHousehold('Reserved', 3)
    const rice = await ingredientId('Rice')
    const recipe = async (name: string) => (await api('POST', `/households/${householdId}/recipes`, { name, baseServings: 3, ingredients: [{ ingredientId: rice, quantity: 300, unit: 'g' }] })).body.id as string
    await recipe(`Plain rice ${Date.now()}`)
    const bowl = await recipe(`Rice bowl ${Date.now()}`)
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: rice, quantity: 300, unit: 'g' })
    const before = (await all(api, householdId)).body.suggestions.find((s: any) => s.recipe.name.startsWith('Plain rice'))
    assert.equal(before.recipe.missingCount, 0)

    await api('POST', `/households/${householdId}/meals`, { date: addDays(today(), 1), slot: 'DINNER', recipeId: bowl })
    const after = (await all(api, householdId)).body.suggestions
    assert.equal(after.find((s: any) => s.recipe.name.startsWith('Plain rice')).recipe.missingCount, 1)
    assert.ok(after.find((s: any) => s.recipe.name.startsWith('Rice bowl')).reasons.some((r: any) => r.text === 'Already planned this week'))
  })

  it('hides snoozed dishes until undone, and follows Love it / Don’t suggest', async () => {
    const { api, householdId } = await signUpWithHousehold('Feedback')
    const upma = await recipeId('Rava Upma')
    assert.equal((await api('POST', `/households/${householdId}/suggestions/${upma}/snooze`)).status, 200)
    const snoozed = await all(api, householdId)
    assert.ok(!names(snoozed.body).includes('Rava Upma'))
    assert.deepEqual(snoozed.body.snoozed.map((s: any) => s.recipe.name), ['Rava Upma'])
    assert.equal((await api('DELETE', `/households/${householdId}/suggestions/${upma}/snooze`)).status, 204)
    assert.ok(names((await all(api, householdId)).body).includes('Rava Upma'))

    const base = suggestion((await all(api, householdId)).body, 'Rava Upma').score
    assert.equal((await api('PUT', `/me/recipe-prefs/${upma}`, { kind: 'FAVOURITE' })).status, 200)
    const loved = suggestion((await all(api, householdId)).body, 'Rava Upma')
    assert.ok(loved.score > base)
    assert.ok(loved.reasons.some((r: any) => r.text === 'Feedback’s favourite'))
    await api('PUT', `/me/recipe-prefs/${upma}`, { kind: 'DISLIKE' })
    assert.ok(suggestion((await all(api, householdId)).body, 'Rava Upma').score < base)
    await api('PUT', `/me/recipe-prefs/${upma}`, { kind: null })
    assert.equal(suggestion((await all(api, householdId)).body, 'Rava Upma').score, base)
    assert.equal((await api('PUT', '/me/recipe-prefs/not-a-recipe', { kind: 'FAVOURITE' })).status, 404)
  })

  it('validates the query', async () => {
    const { api, householdId } = await signUpWithHousehold('Query')
    assert.equal((await api('GET', `/households/${householdId}/suggestions?slot=BRUNCH`)).status, 400)
    const breakfast = await api('GET', `/households/${householdId}/suggestions?slot=BREAKFAST&limit=3`)
    assert.equal(breakfast.body.suggestions.length, 3)
  })
})
