import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

async function sharedRecipeId(name: string) {
  return (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name } })).id
}

const line = (body: any, name: string) => body.ingredients.find((l: any) => l.ingredient.name === name)

describe('recipes API', () => {
  it('lists the 15 seeded recipes for every household', async () => {
    const { api, householdId } = await signUpWithHousehold('Lata', 4)
    const list = await api('GET', `/households/${householdId}/recipes`)
    assert.equal(list.status, 200)
    assert.equal(list.body.servings, 4)
    const shared = list.body.recipes.filter((r: any) => !r.custom)
    assert.equal(shared.length, 15)
    assert.ok(shared.some((r: any) => r.name === 'Dal Tadka' && r.ingredientCount === 13))
  })

  it('scales quantities to the requested servings with decimal math', async () => {
    const { api, householdId } = await signUpWithHousehold('Arjun', 4)
    const id = await sharedRecipeId('Dal Tadka')
    const base = await api('GET', `/households/${householdId}/recipes/${id}`)
    assert.equal(base.body.servings, 4)
    assert.equal(line(base.body, 'Toor dal').quantity, '200')

    const six = await api('GET', `/households/${householdId}/recipes/${id}?servings=6`)
    assert.equal(line(six.body, 'Toor dal').quantity, '300')
    assert.equal(line(six.body, 'Ghee').quantity, '45')

    const three = await api('GET', `/households/${householdId}/recipes/${id}?servings=3`)
    assert.equal(line(three.body, 'Asafoetida (hing)').quantity, '0.75')

    // 6 eggs serve 3; for 4 servings that's exactly 8, and piece counts never come out fractional.
    const eggs = await sharedRecipeId('Egg Bhurji')
    assert.equal(line((await api('GET', `/households/${householdId}/recipes/${eggs}?servings=2`)).body, 'Eggs').quantity, '4')
    assert.equal(line((await api('GET', `/households/${householdId}/recipes/${eggs}?servings=4`)).body, 'Eggs').quantity, '8')

    assert.equal((await api('GET', `/households/${householdId}/recipes/${id}?servings=0`)).status, 400)
  })

  it('compares scaled needs with what is in the pantry', async () => {
    const { api, householdId } = await signUpWithHousehold('Pooja', 4)
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 300, unit: 'ml' })
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Tea leaves'), quantity: 100, unit: 'g' })
    const chai = await sharedRecipeId('Masala Chai')

    const detail = await api('GET', `/households/${householdId}/recipes/${chai}`)
    assert.deepEqual([line(detail.body, 'Milk').inPantry, line(detail.body, 'Milk').missing, line(detail.body, 'Milk').enough], ['300', '100', false])
    assert.equal(line(detail.body, 'Tea leaves').enough, true)
    assert.deepEqual([line(detail.body, 'Sugar').inPantry, line(detail.body, 'Sugar').missing], [null, '20'])
    assert.equal(detail.body.missingCount, 3) // milk short, sugar and ginger absent

    const two = await api('GET', `/households/${householdId}/recipes/${chai}?servings=2`)
    assert.equal(line(two.body, 'Milk').enough, true)
  })

  it('creates custom recipes in canonical units and rejects bad ingredient lines', async () => {
    const { api, householdId } = await signUpWithHousehold('Sana')
    const rice = await ingredientId('Basmati rice')
    const ghee = await ingredientId('Ghee')
    const body = { name: 'Ghee Rice', category: 'Rice', baseServings: 2, prepMinutes: 5, cookMinutes: 20, instructions: ['Cook rice.', ' ', 'Add ghee.'],
      ingredients: [{ ingredientId: rice, quantity: '0.25', unit: 'kg' }, { ingredientId: ghee, quantity: 20, unit: 'ml', note: 'warm' }] }
    const created = await api('POST', `/households/${householdId}/recipes`, body)
    assert.equal(created.status, 201)
    assert.equal(created.body.custom, true)
    assert.equal(line(created.body, 'Basmati rice').quantity, '250')
    assert.equal(line(created.body, 'Ghee').note, 'warm')
    assert.deepEqual(created.body.instructions, ['Cook rice.', 'Add ghee.'])

    const crossUnit = await api('POST', `/households/${householdId}/recipes`, { ...body, ingredients: [{ ingredientId: rice, quantity: 250, unit: 'ml' }] })
    assert.equal(crossUnit.status, 422)
    assert.match(crossUnit.body.error, /Basmati rice/)
    assert.equal((await api('POST', `/households/${householdId}/recipes`, { ...body, ingredients: [body.ingredients[0], body.ingredients[0]] })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/recipes`, { ...body, ingredients: [] })).status, 400)
    assert.equal((await api('POST', `/households/${householdId}/recipes`, { ...body, ingredients: [{ ingredientId: rice, quantity: 0 }] })).status, 400)
  })

  it('keeps built-in recipes read-only and lets households edit a copy', async () => {
    const { api, householdId } = await signUpWithHousehold('Kiran')
    const poha = await sharedRecipeId('Kanda Batata Poha')
    const edit = { name: 'Hacked', baseServings: 4, ingredients: [{ ingredientId: await ingredientId('Salt'), quantity: 1 }] }
    assert.equal((await api('PUT', `/households/${householdId}/recipes/${poha}`, edit)).status, 403)
    assert.equal((await api('DELETE', `/households/${householdId}/recipes/${poha}`)).status, 403)

    const copy = await api('POST', `/households/${householdId}/recipes/${poha}/duplicate`)
    assert.equal(copy.status, 201)
    assert.equal(copy.body.custom, true)
    assert.equal(copy.body.ingredientCount, 13)

    const updated = await api('PUT', `/households/${householdId}/recipes/${copy.body.id}`, { ...edit, name: 'Poha without peanuts' })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.name, 'Poha without peanuts')
    assert.equal(updated.body.ingredientCount, 1)
    assert.equal((await prisma.recipe.findUniqueOrThrow({ where: { id: poha }, include: { ingredients: true } })).ingredients.length, 13)

    assert.equal((await api('DELETE', `/households/${householdId}/recipes/${copy.body.id}`)).status, 204)
    assert.equal((await api('GET', `/households/${householdId}/recipes/${copy.body.id}`)).status, 404)
  })

  it("hides one household's recipes from another", async () => {
    const a = await signUpWithHousehold('Mohan')
    const b = await signUpWithHousehold('Rekha')
    const custom = await a.api('POST', `/households/${a.householdId}/recipes`, { name: 'Family secret dal', baseServings: 4, ingredients: [{ ingredientId: await ingredientId('Toor dal'), quantity: 200 }] })
    const id = custom.body.id

    assert.equal((await b.api('GET', `/households/${b.householdId}/recipes/${id}`)).status, 404)
    assert.equal((await b.api('POST', `/households/${b.householdId}/recipes/${id}/duplicate`)).status, 404)
    assert.equal((await b.api('PUT', `/households/${b.householdId}/recipes/${id}`, { name: 'Mine now', baseServings: 1, ingredients: [{ ingredientId: await ingredientId('Salt'), quantity: 1 }] })).status, 404)
    assert.equal((await b.api('DELETE', `/households/${b.householdId}/recipes/${id}`)).status, 404)
    assert.equal((await b.api('GET', `/households/${a.householdId}/recipes`)).status, 404)
    assert.ok(!(await b.api('GET', `/households/${b.householdId}/recipes`)).body.recipes.some((r: any) => r.id === id))
  })
})
