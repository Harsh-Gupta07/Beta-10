import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessRecipe, recipeDiet, type FoodIngredient, type MemberNeeds } from './foodSafety.js'

const food = (id: string, dietClass: FoodIngredient['dietClass'], allergens: FoodIngredient['allergens'] = [], allergensReviewed = true): FoodIngredient =>
  ({ id, name: id[0]!.toUpperCase() + id.slice(1), dietClass, allergens, allergensReviewed })
const person = (name: string, needs: Partial<MemberNeeds> = {}): MemberNeeds => ({ name, dietType: null, allergens: [], avoidIngredientIds: [], ...needs })

const dal = food('dal', 'PLANT')
const ghee = food('ghee', 'DAIRY', ['MILK'])
const egg = food('egg', 'EGG', ['EGG'])
const chicken = food('chicken', 'MEAT')
const masala = food('masala', 'PLANT', [], false)
const mystery = food('mystery', null)

describe('recipeDiet', () => {
  it('takes the least strict ingredient', () => {
    assert.equal(recipeDiet([dal]), 'VEGAN')
    assert.equal(recipeDiet([dal, ghee]), 'VEGETARIAN')
    assert.equal(recipeDiet([ghee, egg]), 'EGGETARIAN')
    assert.equal(recipeDiet([dal, chicken]), 'NON_VEGETARIAN')
  })

  it('is unknown when an ingredient is unclassified, unless meat already decides it', () => {
    assert.equal(recipeDiet([dal, mystery]), null)
    assert.equal(recipeDiet([chicken, mystery]), 'NON_VEGETARIAN')
  })
})

describe('assessRecipe', () => {
  it('is suitable when nobody has stated needs', () => {
    const result = assessRecipe([dal, ghee, masala, mystery], [person('Asha')])
    assert.equal(result.status, 'SUITABLE')
    assert.deepEqual(result.allergens, ['MILK'])
    assert.deepEqual(result.unreviewed, ['Masala'])
  })

  it('flags an allergy conflict with the member and the allergen', () => {
    const result = assessRecipe([dal, ghee], [person('Asha', { allergens: ['MILK'] }), person('Ravi')])
    assert.equal(result.status, 'CONFLICT')
    assert.deepEqual(result.conflicts, [{ member: 'Asha', kind: 'ALLERGY', reason: 'Contains milk' }])
  })

  it('flags diet restrictions by rank: vegetarians eat dairy but not egg', () => {
    const veg = [person('Meera', { dietType: 'VEGETARIAN' })]
    assert.equal(assessRecipe([dal, ghee], veg).status, 'SUITABLE')
    assert.deepEqual(assessRecipe([egg], veg).conflicts, [{ member: 'Meera', kind: 'RESTRICTION', reason: 'Not vegetarian' }])
    assert.equal(assessRecipe([ghee], [person('V', { dietType: 'VEGAN' })]).status, 'CONFLICT')
    assert.equal(assessRecipe([chicken], [person('N', { dietType: 'NON_VEGETARIAN' })]).status, 'SUITABLE')
  })

  it('flags avoided ingredients as restrictions', () => {
    const result = assessRecipe([dal, ghee], [person('Ravi', { avoidIngredientIds: ['ghee'] })])
    assert.deepEqual(result.conflicts, [{ member: 'Ravi', kind: 'RESTRICTION', reason: 'Contains Ghee' }])
  })

  it('never calls unchecked ingredients safe for someone with an allergy', () => {
    const result = assessRecipe([dal, masala], [person('Asha', { allergens: ['PEANUT'] })])
    assert.equal(result.status, 'UNKNOWN')
    assert.deepEqual(result.uncertain, ['Allergens not checked for Masala'])
  })

  it('is unknown for a vegetarian when an ingredient is unclassified', () => {
    assert.equal(assessRecipe([dal, mystery], [person('Meera', { dietType: 'VEGETARIAN' })]).status, 'UNKNOWN')
  })

  it('reports a known conflict even when other information is missing', () => {
    const result = assessRecipe([ghee, masala], [person('Asha', { allergens: ['MILK'] })])
    assert.equal(result.status, 'CONFLICT')
    assert.equal(result.uncertain.length, 1)
  })
})
