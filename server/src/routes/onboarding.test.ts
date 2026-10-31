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

describe('kitchen roles', () => {
  it('lets the owner assign jobs to everyone and members change only their own', async () => {
    const owner = await signUpWithHousehold('Planner')
    const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
    const member = client()
    await member('POST', '/auth/register', { name: 'Cook', email: `cook-${Date.now()}@example.com`, password: 'a-long-password' })
    await member('POST', '/households/join', { code })
    const ownerId = (await owner.api('GET', '/auth/me')).body.user.id
    const memberId = (await member('GET', '/auth/me')).body.user.id
    const dadi = (await owner.api('POST', `/households/${owner.householdId}/family`, { name: 'Dadi' })).body.id

    const set = await owner.api('PUT', `/households/${owner.householdId}/roles`, {
      members: [{ userId: ownerId, roles: ['PLANNER', 'SHOPPER', 'PLANNER'] }, { userId: memberId, roles: ['STOCK_CHECKER'] }],
      family: [{ id: dadi, roles: ['COOK'] }],
    })
    assert.equal(set.status, 200)
    assert.deepEqual(set.body.members.map((m: any) => m.roles), [['PLANNER', 'SHOPPER'], ['STOCK_CHECKER']])
    assert.deepEqual(set.body.family[0].roles, ['COOK'])
    assert.deepEqual((await member('GET', '/auth/me')).body.household.yourKitchenRoles, ['STOCK_CHECKER'])

    // A member may change their own jobs, but not anyone else's.
    assert.equal((await member('PUT', `/households/${owner.householdId}/roles`, { members: [{ userId: memberId, roles: ['COOK'] }] })).status, 200)
    assert.equal((await member('PUT', `/households/${owner.householdId}/roles`, { members: [{ userId: ownerId, roles: [] }] })).status, 403)
    assert.equal((await member('PUT', `/households/${owner.householdId}/roles`, { family: [{ id: dadi, roles: [] }] })).status, 403)

    // People from elsewhere and unknown jobs are refused.
    assert.equal((await owner.api('PUT', `/households/${owner.householdId}/roles`, { members: [{ userId: 'someone-else', roles: ['COOK'] }] })).status, 400)
    assert.equal((await owner.api('PUT', `/households/${owner.householdId}/roles`, { members: [{ userId: ownerId, roles: ['CHEF'] }] })).status, 400)
    const outsider = await signUpWithHousehold('Outsider')
    assert.equal((await outsider.api('GET', `/households/${owner.householdId}/roles`)).status, 404)
  })
})

describe('language and measures', () => {
  it('saves my language and voice language, and the household’s katori, chammach and mutthi', async () => {
    const { api, householdId } = await signUpWithHousehold('Bhasha')
    assert.deepEqual([(await api('GET', '/auth/me')).body.user.language, (await api('GET', '/auth/me')).body.user.voiceLanguage], ['EN', 'en-IN'])
    const me = await api('PATCH', '/auth/me', { language: 'HINGLISH', voiceLanguage: 'hi-IN' })
    assert.deepEqual([me.status, me.body.language, me.body.voiceLanguage, me.body.name], [200, 'HINGLISH', 'hi-IN', 'Bhasha'])
    assert.equal((await api('PATCH', '/auth/me', { language: 'FR' })).status, 400)

    const measures = await api('PATCH', `/households/${householdId}`, { katoriMl: 150, chammachMl: 15, mutthiGrams: 30 })
    assert.deepEqual([measures.body.katoriMl, measures.body.chammachMl, measures.body.mutthiGrams], [150, 15, 30])
    assert.equal((await api('PATCH', `/households/${householdId}`, { katoriMl: 5000 })).status, 400)
    assert.equal((await api('GET', `/households/${householdId}`)).body.katoriMl, 150)
  })
})
