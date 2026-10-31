import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { rankRecipes, scoreRecipe, WEIGHTS, type Candidate, type RankContext } from './recommend.js'

const dish = (id: string, overrides: Partial<Candidate> = {}): Candidate => ({
  id, name: id, category: 'Dals & Curries', cuisine: '', spiceLevel: null, tags: [], safety: 'SUITABLE', minutes: 30,
  missingCount: 0, ingredientCount: 5, lastEatenDaysAgo: 30, timesEaten30: 1, eatenInSlot: {}, plannedSoon: false, favouriteOf: [], dislikedBy: [],
  ...overrides,
})
const context: RankContext = { slot: null, cuisines: [], spiceLimits: [] }
const texts = (c: Candidate, ctx = context) => scoreRecipe(c, ctx).reasons.map(r => r.text)

describe('rankRecipes', () => {
  it('never suggests dishes that clash with someone, or drinks', () => {
    const ranked = rankRecipes([dish('ok'), dish('clash', { safety: 'CONFLICT' }), dish('chai', { category: 'Beverages' }), dish('lassi', { tags: ['beverage'] })], context)
    assert.deepEqual(ranked.map(r => r.id), ['ok'])
  })

  it('prefers what can be cooked from unreserved stock', () => {
    assert.deepEqual(rankRecipes([dish('short', { missingCount: 2 }), dish('ready')], context).map(r => r.id), ['ready', 'short'])
    assert.equal(scoreRecipe(dish('x', { missingCount: 9 }), context).score, scoreRecipe(dish('x', { missingCount: 5 }), context).score, 'missing penalty is capped')
  })

  it('pushes recently and frequently eaten dishes down, and lifts ones not had in a while', () => {
    const order = rankRecipes([
      dish('yesterday', { lastEatenDaysAgo: 1 }), dish('last-week', { lastEatenDaysAgo: 5 }),
      dish('ages', { lastEatenDaysAgo: 20 }), dish('often', { lastEatenDaysAgo: 10, timesEaten30: 4 }),
    ], context).map(r => r.id)
    assert.deepEqual(order, ['ages', 'often', 'last-week', 'yesterday'])
    assert.ok(texts(dish('y', { lastEatenDaysAgo: 1 })).includes('You had this yesterday'))
    assert.ok(texts(dish('n', { lastEatenDaysAgo: null })).includes('Something you haven’t had recently'))
  })

  it('counts favourites and dislikes per person and names them, but not in the AI version', () => {
    const fav = scoreRecipe(dish('f', { favouriteOf: ['Asha', 'Ravi'] }), context)
    assert.equal(fav.score, scoreRecipe(dish('f'), context).score + 2 * WEIGHTS.favourite)
    const reason = fav.reasons.find(r => r.tone === 'good' && r.text.includes('favourite'))!
    assert.equal(reason.text, 'Asha and Ravi’s favourite')
    assert.ok(!reason.anonymous.includes('Asha'))
    assert.ok(scoreRecipe(dish('d', { dislikedBy: ['Ravi'] }), context).score < scoreRecipe(dish('d'), context).score)
  })

  it('applies planned-soon, cuisine and spice signals', () => {
    assert.ok(texts(dish('p', { plannedSoon: true })).includes('Already planned this week'))
    assert.ok(texts(dish('c', { cuisine: 'Punjabi' }), { ...context, cuisines: ['punjabi'] }).includes('Punjabi, a cuisine you like'))
    assert.ok(texts(dish('s', { spiceLevel: 4 }), { ...context, spiceLimits: [{ name: 'Meera', max: 2 }, { name: 'Ravi', max: 5 }] }).includes('Spicier than Meera likes'))
  })

  it('fits the slot from history first, then the breakfast category', () => {
    const breakfast = { ...context, slot: 'BREAKFAST' as const }
    const dinner = { ...context, slot: 'DINNER' as const }
    assert.ok(texts(dish('poha', { category: 'Breakfast' }), breakfast).includes('A breakfast dish'))
    assert.ok(texts(dish('poha', { category: 'Breakfast' }), dinner).includes('Usually a breakfast dish'))
    assert.ok(texts(dish('dal', { eatenInSlot: { BREAKFAST: 2 } }), breakfast).includes('You’ve had it for breakfast before'))
  })

  it('flags unchecked ingredients without changing the score', () => {
    const unknown = scoreRecipe(dish('u', { safety: 'UNKNOWN' }), context)
    assert.equal(unknown.score, scoreRecipe(dish('u'), context).score)
    assert.ok(unknown.reasons.some(r => r.text === 'Check ingredients for allergies'))
  })

  it('breaks ties by name so the order is stable', () => {
    assert.deepEqual(rankRecipes([dish('b'), dish('a'), dish('c')], context).map(r => r.id), ['a', 'b', 'c'])
  })
})

describe('cooking time', () => {
  it('ranks dishes longer than the household usually has lower, and says why', () => {
    const quick = { slot: null, cuisines: [], spiceLimits: [], usualMinutes: 40 }
    const slow = scoreRecipe(dish('rajma', { minutes: 70 }), quick)
    assert.equal(slow.score, scoreRecipe(dish('rajma', { minutes: 30 }), quick).score + WEIGHTS.tooLong)
    assert.ok(slow.reasons.some(r => r.text === 'Takes 70 min; you usually have 40'))
    assert.equal(scoreRecipe(dish('rajma', { minutes: 70 }), context).score, scoreRecipe(dish('rajma'), context).score, 'no limit set, no change')
  })
})
