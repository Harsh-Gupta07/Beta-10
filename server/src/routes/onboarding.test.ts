import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { client, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

const recipeNamed = (body: { recipes: Array<{ name: string }> }, name: string) => body.recipes.find(r => r.name === name) as any

describe('onboarding', () => {
  it('starts new households in setup and lets only the owner finish it', async () => {
    const api = client()
    await api('POST', '/auth/register', { name: 'Newcomer', email: `new-${Date.now()}@example.com`, password: 'a-long-password' })
    const created = await api('POST', '/households', { name: 'Fresh kitchen', defaultServings: 4, peopleCount: 5 })
    assert.equal(created.status, 201)
    assert.deepEqual([created.body.peopleCount, created.body.onboardingCompletedAt], [5, null])
    assert.equal((await api('GET', '/auth/me')).body.household.onboardingCompletedAt, null)

    const code = (await api('POST', `/households/${created.body.id}/invite-code`)).body.inviteCode
    const member = client()
    await member('POST', '/auth/register', { name: 'Helper', email: `helper-${Date.now()}@example.com`, password: 'a-long-password' })
    await member('POST', '/households/join', { code })
    assert.equal((await member('POST', `/households/${created.body.id}/onboarding/complete`)).status, 403)

    assert.equal((await api('POST', `/households/${created.body.id}/onboarding/complete`)).status, 200)
    assert.ok((await api('GET', '/auth/me')).body.household.onboardingCompletedAt)
  })

  it('saves age group, health goals and fasts on my own profile without wiping them later', async () => {
    const { api } = await signUpWithHousehold('Faster')
    const saved = await api('PUT', '/me/food-preferences', { dietType: 'VEGETARIAN', ageGroup: 'ADULT', healthGoals: ['LOW_OIL', 'LOW_OIL'], weeklyFasts: ['MON'] })
    assert.deepEqual([saved.body.ageGroup, saved.body.healthGoals, saved.body.weeklyFasts], ['ADULT', ['LOW_OIL'], ['MON']])
    // A save that doesn't mention them (e.g. from the Food Preferences page) keeps them.
    const again = await api('PUT', '/me/food-preferences', { dietType: 'VEGAN' })
    assert.deepEqual([again.body.dietType, again.body.ageGroup, again.body.weeklyFasts], ['VEGAN', 'ADULT', ['MON']])
    assert.equal((await api('PUT', '/me/food-preferences', { weeklyFasts: ['FUNDAY'] })).status, 400)
  })
})

describe('family profiles', () => {
  it('lets members add, edit and remove people without a login', async () => {
    const { api, householdId } = await signUpWithHousehold('Parent')
    const kid = await api('POST', `/households/${householdId}/family`, { name: 'Anya', ageGroup: 'CHILD', dietType: 'VEGETARIAN', allergens: ['PEANUT'], weeklyFasts: [] })
    assert.equal(kid.status, 201)
    assert.equal((await api('GET', `/households/${householdId}/family`)).body.length, 1)
    const edited = await api('PUT', `/households/${householdId}/family/${kid.body.id}`, { name: 'Anya', ageGroup: 'CHILD', allergens: ['PEANUT', 'MILK'] })
    assert.deepEqual(edited.body.allergens, ['PEANUT', 'MILK'])
    assert.equal((await api('POST', `/households/${householdId}/family`, { name: '' })).status, 400)

    const outsider = await signUpWithHousehold('Outsider')
    assert.equal((await outsider.api('PUT', `/households/${outsider.householdId}/family/${kid.body.id}`, { name: 'Hijack' })).status, 404)
    assert.equal((await outsider.api('GET', `/households/${householdId}/family`)).status, 404)

    assert.equal((await api('DELETE', `/households/${householdId}/family/${kid.body.id}`)).status, 204)
    assert.equal((await api('GET', `/households/${householdId}/family`)).body.length, 0)
  })

  it('applies a family member’s allergies and diet to recipes and suggestions', async () => {
    const { api, householdId } = await signUpWithHousehold('Guardian')
    await api('POST', `/households/${householdId}/family`, { name: 'Dadi', ageGroup: 'SENIOR', dietType: 'VEGETARIAN', allergens: ['MILK'] })
    const { body } = await api('GET', `/households/${householdId}/recipes`)
    assert.deepEqual(recipeNamed(body, 'Palak Paneer').safety.conflicts, [{ member: 'Dadi', kind: 'ALLERGY', reason: 'Contains milk' }])
    assert.ok(recipeNamed(body, 'Egg Bhurji').safety.conflicts.some((c: any) => c.member === 'Dadi' && c.reason === 'Not vegetarian'))

    const suggestions = await api('GET', `/households/${householdId}/suggestions?limit=30`)
    assert.ok(!suggestions.body.suggestions.some((s: any) => s.recipe.name === 'Palak Paneer'))
    const profile = await api('GET', `/households/${householdId}/food-profile`)
    assert.deepEqual(profile.body.family.map((f: any) => f.name), ['Dadi'])
  })
})

describe('kitchen setup', () => {
  it('saves appliances and cooking time, and uses the time in suggestions', async () => {
    const { api, householdId } = await signUpWithHousehold('Kitchen')
    const saved = await api('PATCH', `/households/${householdId}`, { appliances: ['GAS_STOVE', 'PRESSURE_COOKER', 'GAS_STOVE'], usualCookMinutes: 40 })
    assert.equal(saved.status, 200)
    assert.deepEqual([saved.body.appliances, saved.body.usualCookMinutes], [['GAS_STOVE', 'PRESSURE_COOKER'], 40])
    assert.equal((await api('PATCH', `/households/${householdId}`, { appliances: ['TANDOOR'] })).status, 400)
    assert.equal((await api('PATCH', `/households/${householdId}`, { usualCookMinutes: 1 })).status, 400)
    assert.deepEqual((await api('GET', `/households/${householdId}`)).body.appliances, ['GAS_STOVE', 'PRESSURE_COOKER'])

    const { body } = await api('GET', `/households/${householdId}/suggestions?limit=30`)
    const rajma = body.suggestions.find((s: any) => s.recipe.name === 'Rajma Chawal')
    assert.ok(rajma.reasons.some((r: any) => r.text === 'Takes 70 min; you usually have 40'))
  })
})
