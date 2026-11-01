import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGoogleSearchResponse, shouldRetryWithFallback } from './assistant.js'

describe('assistant model fallback', () => {
  it('retries when the primary model is unavailable, rate limited, or failing', () => {
    for (const status of [404, 429, 500, 503]) {
      assert.equal(shouldRetryWithFallback(status), true, `expected HTTP ${status} to retry`)
    }
  })

  describe('Google Search grounding response', () => {
    it('extracts grounded answer citations and only keeps secure source URLs', () => {
      const result = parseGoogleSearchResponse({
        steps: [
          { type: 'google_search_call', arguments: { queries: ['current food safety guidance'] } },
          {
            type: 'model_output',
            content: [{
              type: 'text',
              text: 'Keep food refrigerated.',
              annotations: [
                { type: 'url_citation', title: 'Food agency', url: 'https://foodsafety.gov/guide' },
                { type: 'url_citation', title: 'Duplicate', url: 'https://foodsafety.gov/guide' },
                { type: 'url_citation', title: 'Unsafe', url: 'javascript:alert(1)' },
              ],
            }],
          },
        ],
      })
      assert.deepEqual(result, {
        reply: 'Keep food refrigerated.',
        searched: true,
        sources: [{ title: 'Food agency', url: 'https://foodsafety.gov/guide' }],
      })
    })

    it('rejects responses with no answer text', () => {
      assert.equal(parseGoogleSearchResponse({ steps: [{ type: 'google_search_call' }] }), null)
      assert.equal(parseGoogleSearchResponse({}), null)
    })
  })

  it('does not retry model errors that a second model cannot fix', () => {
    for (const status of [400, 401, 403]) {
      assert.equal(shouldRetryWithFallback(status), false, `expected HTTP ${status} not to retry`)
    }
  })
})
