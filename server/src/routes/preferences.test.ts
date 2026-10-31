import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { client, ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

async function recipeId(name: string) {
  return (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id
}

/** An owner plus a second member who joined with the invite code. */
async function twoMemberHousehold(memberName: string) {
  const owner = await signUpWithHousehold('Owner')
  const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
  const member = client()
  await member('POST', '/auth/register', { name: memberName, email: `${memberName.toLowerCase()}-${Date.now()}@example.com`, password: 'a-long-password' })
  assert.equal((await member('POST', '/households/join', { code })).status, 201)
  return { owner, member }
}

const recipeNamed = (body: { recipes: Array<{ name: string }> }, name: string) => body.recipes.find(recipe => recipe.name === name) as any

describe('food preferences', () => {
  it('starts empty, saves the whole set, and validates references', async () => {
    const { api } = await signUpWithHousehold('Prefs')
    const empty = await api('GET', '/me/food-preferences')
    assert.deepEqual([empty.status, empty.body.dietType, empty.body.allergens], [200, null, []])

    const garlic = await ingredientId('Garlic')
    const paneer = await ingredientId('Paneer')
    const saved = await api('PUT', '/me/food-preferences', {
      dietType: 'VEGETARIAN', allergens: ['PEANUT', 'PEANUT'], maxSpice: 3, cuisines: [' Punjabi ', 'Punjabi'],
      avoidIngredientIds: [garlic], likedIngredientIds: [paneer], favouriteRecipeIds: [await recipeId('Dal Tadka')], dislikedRecipeIds: [await recipeId('Rava Upma')],
    })
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.body.allergens, ['PEANUT'])
    assert.deepEqual(saved.body.cuisines, ['Punjabi'])
    assert.deepEqual(saved.body.avoidIngredients.map((i: { name: string }) => i.name), ['Garlic'])
    assert.deepEqual(saved.body.favouriteRecipes.map((r: { name: string }) => r.name), ['Dal Tadka'])

    assert.equal((await api('PUT', '/me/food-preferences', { allergens: ['NUTS'] })).status, 400)
    assert.equal((await api('PUT', '/me/food-preferences', { maxSpice: 9 })).status, 400)
    assert.equal((await api('PUT', '/me/food-preferences', { avoidIngredientIds: ['not-a-real-id'] })).status, 400)
    assert.equal((await api('PUT', '/me/food-preferences', { avoidIngredientIds: [garlic], likedIngredientIds: [garlic] })).status, 400)

    // Saving again replaces the previous set rather than adding to it.
    const cleared = await api('PUT', '/me/food-preferences', { dietType: null })
    assert.deepEqual([cleared.body.allergens, cleared.body.avoidIngredients, cleared.body.favouriteRecipes], [[], [], []])
  })

  it('requires sign-in', async () => {
    assert.equal((await client()('GET', '/me/food-preferences')).status, 401)
  })

  it('cannot reference another household’s custom ingredient', async () => {
    const other = await signUpWithHousehold('Other')
    const custom = await other.api('POST', `/households/${other.householdId}/ingredients`, { name: `Secret spice ${Date.now()}`, canonicalUnit: 'g' })
    const { api } = await signUpWithHousehold('Nosy')
    assert.equal((await api('PUT', '/me/food-preferences', { avoidIngredientIds: [custom.body.id] })).status, 400)
  })
})

describe('recipe suitability', () => {
  it('derives diet type and allergens from the seeded ingredient tags', async () => {
    const { api, householdId } = await signUpWithHousehold('Tags')
    const { body } = await api('GET', `/households/${householdId}/recipes`)
    const bhurji = recipeNamed(body, 'Egg Bhurji')
    assert.equal(bhurji.dietType, 'EGGETARIAN')
    assert.ok(bhurji.allergens.includes('EGG'))
    assert.equal(recipeNamed(body, 'Palak Paneer').dietType, 'VEGETARIAN')
    assert.ok(recipeNamed(body, 'Aloo Paratha').allergens.includes('GLUTEN'))
    assert.equal(bhurji.cuisine, 'North Indian')
    assert.equal(typeof bhurji.spiceLevel, 'number')
    // With no stated needs, nothing conflicts.
    assert.ok(body.recipes.every((recipe: any) => recipe.safety.status === 'SUITABLE'))
  })

  it('applies every member’s allergies and diet to the whole household', async () => {
    const { owner, member } = await twoMemberHousehold('Asha')
    await member('PUT', '/me/food-preferences', { dietType: 'VEGETARIAN', allergens: ['MILK'] })
    const { body } = await owner.api('GET', `/households/${owner.householdId}/recipes`)

    const paneer = recipeNamed(body, 'Palak Paneer')
    assert.equal(paneer.safety.status, 'CONFLICT')
    assert.deepEqual(paneer.safety.conflicts, [{ member: 'Asha', kind: 'ALLERGY', reason: 'Contains milk' }])
    assert.ok(recipeNamed(body, 'Egg Bhurji').safety.conflicts.some((c: any) => c.reason === 'Not vegetarian'))
    // Masala Chai has milk too; detail view agrees with the list.
    const chai = await owner.api('GET', `/households/${owner.householdId}/recipes/${recipeNamed(body, 'Masala Chai').id}`)
    assert.equal(chai.body.safety.status, 'CONFLICT')
    assert.ok(chai.body.ingredients.some((line: any) => line.allergens.includes('MILK')))

    const safe = await owner.api('GET', `/households/${owner.householdId}/recipes?safe=1`)
    assert.ok(safe.body.recipes.length > 0)
    assert.ok(safe.body.recipes.every((recipe: any) => recipe.safety.status === 'SUITABLE'))
    assert.ok(!safe.body.recipes.some((recipe: any) => recipe.name === 'Palak Paneer'))
  })

  it('treats unchecked ingredients as unknown for someone with an allergy', async () => {
    const { api, householdId } = await signUpWithHousehold('Careful')
    await api('PUT', '/me/food-preferences', { allergens: ['TREE_NUT'] })
    const { body } = await api('GET', `/households/${householdId}/recipes`)
    // Chole uses chole masala, which stays unreviewed in the seed.
    const chole = recipeNamed(body, 'Chole')
    assert.equal(chole.safety.status, 'UNKNOWN')
    assert.ok(chole.safety.unreviewed.includes('Chole masala'))
  })

  it('stops applying a member’s needs once they are removed', async () => {
    const { owner, member } = await twoMemberHousehold('Leaver')
    const me = await member('GET', '/auth/me')
    await member('PUT', '/me/food-preferences', { allergens: ['MILK'] })
    const before = await owner.api('GET', `/households/${owner.householdId}/recipes`)
    assert.equal(recipeNamed(before.body, 'Palak Paneer').safety.status, 'CONFLICT')
    assert.equal((await owner.api('DELETE', `/households/${owner.householdId}/members/${me.body.user.id}`)).status, 204)
    const after = await owner.api('GET', `/households/${owner.householdId}/recipes`)
    assert.equal(recipeNamed(after.body, 'Palak Paneer').safety.status, 'SUITABLE')
  })

  it('stores cuisine, spice and tags on custom recipes and keeps them on duplicate', async () => {
    const { api, householdId } = await signUpWithHousehold('Cook')
    const created = await api('POST', `/households/${householdId}/recipes`, {
      name: 'Garlic Rice', baseServings: 2, cuisine: 'Indo-Chinese', spiceLevel: 2, tags: ['Quick', 'quick', ' leftovers '],
      ingredients: [{ ingredientId: await ingredientId('Rice'), quantity: 200, unit: 'g' }, { ingredientId: await ingredientId('Garlic'), quantity: 10, unit: 'g' }],
    })
    assert.equal(created.status, 201)
    assert.deepEqual([created.body.cuisine, created.body.spiceLevel, created.body.tags, created.body.dietType], ['Indo-Chinese', 2, ['quick', 'leftovers'], 'VEGAN'])
    const copy = await api('POST', `/households/${householdId}/recipes/${created.body.id}/duplicate`)
    assert.deepEqual([copy.body.cuisine, copy.body.spiceLevel, copy.body.tags], ['Indo-Chinese', 2, ['quick', 'leftovers']])
    assert.equal((await api('POST', `/households/${householdId}/recipes`, { name: 'Too hot', baseServings: 2, spiceLevel: 6, ingredients: [{ ingredientId: await ingredientId('Rice'), quantity: 100 }] })).status, 400)
  })
})

describe('ingredient tags', () => {
  it('lets a household tag its own ingredients but not the built-in catalog', async () => {
    const { api, householdId } = await signUpWithHousehold('Tagger')
    const created = await api('POST', `/households/${householdId}/ingredients`, { name: `Cashew paste ${Date.now()}`, canonicalUnit: 'g' })
    assert.deepEqual([created.body.dietClass, created.body.allergens, created.body.allergensReviewed], [null, [], false])
    const tagged = await api('PATCH', `/households/${householdId}/ingredients/${created.body.id}`, { dietClass: 'PLANT', allergens: ['TREE_NUT'], allergensReviewed: true })
    assert.deepEqual([tagged.status, tagged.body.allergens, tagged.body.allergensReviewed], [200, ['TREE_NUT'], true])
    assert.equal((await api('PATCH', `/households/${householdId}/ingredients/${await ingredientId('Milk')}`, { allergens: [] })).status, 403)
    const other = await signUpWithHousehold('Stranger')
    assert.equal((await other.api('PATCH', `/households/${other.householdId}/ingredients/${created.body.id}`, { allergens: [] })).status, 404)
  })
})

describe('household food profile', () => {
  it('shows members’ hard rules to the household, but only the owner edits defaults', async () => {
    const { owner, member } = await twoMemberHousehold('Meera')
    await member('PUT', '/me/food-preferences', { dietType: 'VEGAN', allergens: ['SESAME'], favouriteRecipeIds: [await recipeId('Chole')] })
    const profile = await owner.api('GET', `/households/${owner.householdId}/food-profile`)
    const meera = profile.body.members.find((m: any) => m.name === 'Meera')
    assert.deepEqual([meera.dietType, meera.allergens], ['VEGAN', ['SESAME']])
    // Likes and favourites stay personal.
    assert.equal(meera.favouriteRecipes, undefined)

    const ownerId = (await owner.api('GET', '/auth/me')).body.user.id
    assert.equal((await member('PUT', `/households/${owner.householdId}/food-profile`, { cuisines: ['Gujarati'] })).status, 403)
    const updated = await owner.api('PUT', `/households/${owner.householdId}/food-profile`, { cuisines: ['Gujarati'], usualSpice: 2 })
    assert.deepEqual([updated.status, updated.body.cuisines, updated.body.usualSpice], [200, ['Gujarati'], 2])
    assert.ok(updated.body.members.some((m: any) => m.id === ownerId))

    const outsider = await signUpWithHousehold('Outsider')
    assert.equal((await outsider.api('GET', `/households/${owner.householdId}/food-profile`)).status, 404)
  })
})
