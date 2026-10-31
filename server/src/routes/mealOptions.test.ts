import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { ingredientId, signUpWithHousehold, useTestServer, type Client } from '../test/helpers.js'

useTestServer()

const today = () => localToday('Asia/Kolkata')

/** A household with known stock and three small recipes: one ready, one ready with a swap, one that needs shopping. */
async function kitchen() {
  const { api, householdId } = await signUpWithHousehold('Options', 2)
  const h = `/households/${householdId}`
  for (const [name, quantity, unit] of [['Potato', 1, 'kg'], ['Cumin seeds', 100, 'g'], ['Tofu', 500, 'g'], ['Oil', 500, 'ml'], ['Onion', 500, 'g']] as const) {
    assert.equal((await api('POST', `${h}/pantry`, { ingredientId: await ingredientId(name), quantity, unit })).status, 201)
  }
  const recipe = async (name: string, lines: Array<[string, number]>) => (await api('POST', `${h}/recipes`, { name, baseServings: 2, ingredients: await Promise.all(lines.map(async ([n, q]) => ({ ingredientId: await ingredientId(n), quantity: q }))) })).body.id as string
  return {
    api, h,
    jeera: await recipe('Test Jeera Aloo', [['Potato', 400], ['Cumin seeds', 5]]),
    paneer: await recipe('Test Paneer Fry', [['Paneer', 200], ['Oil', 20]]),
    rajma: await recipe('Test Rajma', [['Rajma', 200], ['Onion', 100]]),
  }
}

async function options(api: Client, h: string, query = '') {
  const res = await api('GET', `${h}/meal-options?${query.includes('limit=') ? '' : 'limit=30'}${query}`)
  assert.equal(res.status, 200)
  return res.body
}
const find = (body: any, id: string) => body.options.find((o: any) => o.recipe.id === id)

describe('meal options', () => {
  it('labels each dish fully available, needs substitution or needs purchase', async () => {
    const { api, h, jeera, paneer, rajma } = await kitchen()
    const body = await options(api, h)
    assert.equal(body.servings, 2)
    assert.equal(body.aiAvailable, false)

    const ready = find(body, jeera)
    assert.equal(ready.status, 'FULLY_AVAILABLE')
    assert.deepEqual(ready.coverage, { inPantry: 2, total: 2, percent: 100 })
    assert.equal(ready.reasons[0].text, 'Everything is in your pantry')

    const swap = find(body, paneer)
    assert.equal(swap.status, 'NEEDS_SUBSTITUTION')
    assert.deepEqual(swap.substitutions.map((s: any) => [s.original.name, s.original.quantity, s.substitute.name, s.substitute.quantity, s.substitute.unit]), [['Paneer', '200', 'Tofu', '200', 'g']])
    assert.deepEqual(swap.toBuy, [])

    const buy = find(body, rajma)
    assert.equal(buy.status, 'NEEDS_PURCHASE')
    // Only the shortfall is listed, and Kabuli chana isn't offered because there is none in stock.
    assert.deepEqual(buy.toBuy.map((t: any) => [t.ingredient.name, t.quantity, t.unit, t.swapAvailable]), [['Rajma', '200', 'g', null]])
    assert.deepEqual(buy.coverage, { inPantry: 1, total: 2, percent: 50 })

    // Ready dishes rank above the same dish needing a swap, which ranks above needing to shop.
    const order = body.options.map((o: any) => o.recipe.id)
    assert.ok(order.indexOf(jeera) < order.indexOf(paneer) && order.indexOf(paneer) < order.indexOf(rajma))
    assert.equal(body.counts.FULLY_AVAILABLE >= 1 && body.counts.NEEDS_SUBSTITUTION >= 1 && body.counts.NEEDS_PURCHASE >= 1, true)
  })

  it('scales to the chosen servings and only counts stock not already reserved', async () => {
    const { api, h, jeera, paneer } = await kitchen()
    // 6 servings of the paneer dish needs 600 g; the 500 g of tofu can't cover it, so it must be bought.
    const six = find(await options(api, h, '&servings=6'), paneer)
    assert.equal(six.status, 'NEEDS_PURCHASE')
    assert.deepEqual(six.toBuy.map((t: any) => [t.ingredient.name, t.quantity, t.swapAvailable]), [['Paneer', '600', null]])

    // Planning Jeera Aloo tomorrow reserves 400 g of the 1 kg of potatoes, leaving 600 g free.
    assert.equal((await api('POST', `${h}/meals`, { date: addDays(today(), 1), slot: 'DINNER', recipeId: jeera })).status, 201)
    assert.equal(find(await options(api, h, '&servings=3'), jeera).status, 'FULLY_AVAILABLE')
    const four = find(await options(api, h, '&servings=4'), jeera)
    assert.equal(four.status, 'NEEDS_PURCHASE')
    assert.deepEqual(four.toBuy.map((t: any) => [t.ingredient.name, t.quantity]), [['Potato', '200']])
  })

  it('never offers a swap that clashes with someone’s allergy', async () => {
    const { api, h, paneer } = await kitchen()
    assert.equal((await api('POST', `${h}/family`, { name: 'Kabir', allergens: ['SOY'] })).status, 201)
    const option = find(await options(api, h), paneer)
    assert.equal(option.status, 'NEEDS_PURCHASE')
    assert.deepEqual(option.substitutions, [])
  })

  it('points out ingredients that expire soon and favours dishes that use them', async () => {
    const { api, h, jeera } = await kitchen()
    const potato = (await prisma.pantryItem.findFirstOrThrow({ where: { household: { id: h.split('/')[2] }, ingredient: { name: 'Potato' } } })).id
    await api('PATCH', `${h}/pantry/${potato}`, { expiresAt: addDays(today(), 1) })
    const option = find(await options(api, h), jeera)
    assert.deepEqual(option.expiring.map((e: any) => [e.ingredient.name, e.daysLeft, e.expired]), [['Potato', 1, false]])
    assert.ok(option.reasons.some((r: any) => r.text === 'Uses up Potato (1 day left)'))
  })

  it('regenerates without repeating what is on screen, then starts again', async () => {
    const { api, h } = await kitchen()
    const first = await options(api, h, '&limit=3')
    const shown = first.options.map((o: any) => o.recipe.id)
    const next = await options(api, h, `&limit=3&exclude=${shown.join(',')}`)
    assert.equal(next.wrapped, false)
    assert.ok(next.options.every((o: any) => !shown.includes(o.recipe.id)))
    const everything = (await options(api, h)).options.map((o: any) => o.recipe.id)
    const again = await options(api, h, `&limit=3&exclude=${everything.join(',')}`)
    assert.equal(again.wrapped, true)
    assert.deepEqual(again.options.map((o: any) => o.recipe.id), shown)
    // Filtering by status keeps only that group.
    assert.ok((await options(api, h, '&status=NEEDS_SUBSTITUTION')).options.every((o: any) => o.status === 'NEEDS_SUBSTITUTION'))
  })

  it('builds a swapped recipe draft without saving anything', async () => {
    const { api, h, paneer } = await kitchen()
    const before = await prisma.recipe.count()
    const swap = find(await options(api, h), paneer).substitutions[0]
    const draft = await api('POST', `${h}/meal-options/swap`, { recipeId: paneer, servings: 2, swaps: [{ originalId: swap.original.id, substituteId: swap.substitute.id }] })
    assert.equal(draft.status, 200)
    assert.equal(draft.body.kind, 'SWAP')
    assert.equal(draft.body.name, 'Test Paneer Fry (with Tofu)')
    assert.deepEqual(draft.body.ingredients.map((i: any) => [i.ingredientName, i.quantity, i.unit, i.note]), [['Tofu', '200', 'g', 'instead of Paneer'], ['Oil', '20', 'ml', '']])
    assert.equal(await prisma.recipe.count(), before)
    // A swap the list doesn't allow is refused.
    const bad = await api('POST', `${h}/meal-options/swap`, { recipeId: paneer, servings: 2, swaps: [{ originalId: swap.original.id, substituteId: await ingredientId('Onion') }] })
    assert.equal(bad.status, 400)
  })

  it('works offline: AI ideas say they need Gemini, and Cook now knows the current meal', async () => {
    const { api, h } = await kitchen()
    const ai = await api('POST', `${h}/meal-options/ai`, {})
    assert.equal(ai.status, 409)
    assert.equal(ai.body.code, 'AI_NOT_CONFIGURED')
    const body = await options(api, h)
    assert.equal(body.cookNow.date, today())
    assert.ok(['BREAKFAST', 'LUNCH', 'DINNER'].includes(body.cookNow.slot))
    assert.deepEqual(body.cookNow.planned, [])
  })
})

describe('AI meal ideas (Gemini stubbed)', () => {
  it('re-checks every AI idea: unsafe ones are dropped, unknown ingredients are flagged, stock is our own maths', async () => {
    const { env } = await import('../config/env.js')
    const { aiMealIdeas } = await import('../services/mealOptions.js')
    const { api, h } = await kitchen()
    const householdId = h.split('/')[2]!
    assert.equal((await api('POST', `${h}/family`, { name: 'Meera', allergens: ['PEANUT'] })).status, 201)
    const owner = (await prisma.householdMember.findFirstOrThrow({ where: { householdId } })).userId

    const answer = { ideas: [
      { name: 'Aloo Tofu Bhurji', category: 'Breakfast', prep_minutes: 10, cook_minutes: 15, steps: ['Fry', 'Serve'],
        ingredients: [{ name: 'Potato', quantity: 300, unit: 'g' }, { name: 'tofu', quantity: 200, unit: 'grams' }, { name: 'Dragonfruit', quantity: 1, unit: 'pcs' }] },
      { name: 'Peanut Chaat', steps: ['Mix'], ingredients: [{ name: 'Peanuts', quantity: 100, unit: 'g' }, { name: 'Onion', quantity: 50, unit: 'g' }] },
    ] }
    const realFetch = globalThis.fetch
    const sent: string[] = []
    const savedKey = env.AI_API_KEY
    env.AI_API_KEY = 'test-key'
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init)
      sent.push(String(init?.body))
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 })
    }) as typeof fetch
    try {
      const result = await aiMealIdeas(householdId, owner, { servings: 2, slot: 'BREAKFAST', scope: 'household' })
      assert.deepEqual(result.ideas.map(i => i.draft.name), ['Aloo Tofu Bhurji'])
      const [idea] = result.ideas
      assert.equal(idea!.draft.kind, 'AI')
      assert.deepEqual(idea!.draft.unresolved, ['1 pcs Dragonfruit'])
      assert.equal(idea!.status, 'FULLY_AVAILABLE')
      assert.deepEqual(idea!.coverage, { inPantry: 2, total: 2, percent: 100 })
      // Gemini gets stock and anonymous limits, never people's names.
      assert.match(sent[0]!, /Allergens to avoid completely: peanut/)
      assert.doesNotMatch(sent[0]!, /Meera|Options/)
    } finally {
      globalThis.fetch = realFetch
      env.AI_API_KEY = savedKey
    }
  })
})
