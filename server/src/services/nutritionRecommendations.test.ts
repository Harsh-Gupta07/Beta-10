import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAiRanking } from './nutritionRecommendations.js'

describe('AI nutrition recommendation ranking', () => {
  const allowedIds = new Set(['recipe-a', 'recipe-b', 'recipe-c'])

  it('keeps only eligible recipe IDs and removes duplicates while preserving AI order', () => {
    const result = parseAiRanking(
      '{"recipeIds":["recipe-c","not-eligible","recipe-a","recipe-c"]}',
      allowedIds,
    )
    assert.deepEqual(result, ['recipe-c', 'recipe-a'])
  })

  it('returns null when the response is malformed or has no eligible IDs', () => {
    assert.equal(parseAiRanking('not json', allowedIds), null)
    assert.equal(parseAiRanking('{"recipeIds":["not-eligible"]}', allowedIds), null)
    assert.equal(parseAiRanking('{"ids":["recipe-a"]}', allowedIds), null)
  })

  it('rejects rankings beyond the requested six-recipe limit', () => {
    const ids = ['recipe-a', 'recipe-b', 'recipe-c', 'recipe-a', 'recipe-b', 'recipe-c', 'recipe-a']
    assert.equal(parseAiRanking(JSON.stringify({ recipeIds: ids }), allowedIds), null)
  })
})
