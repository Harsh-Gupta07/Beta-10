import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.js'
import { addDays, localToday } from '../services/dates.js'
import { resolveIngredient } from '../services/assistant.js'
import { listIngredients } from '../services/pantry.js'
import { client, ingredientId, signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('stock verification and notifications', () => {
  it('prioritises uncertain stock that upcoming meals need, and notifies when a correction affects a plan', async () => {
    const { api, householdId } = await signUpWithHousehold('Verifier', 4)
    const milk = await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Milk'), quantity: 800, unit: 'ml', confidence: 'ESTIMATED' })
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Salt'), quantity: 500, unit: 'g', confidence: 'CONFIRMED' })
    await api('POST', `/households/${householdId}/pantry`, { ingredientId: await ingredientId('Sugar'), quantity: 500, unit: 'g', confidence: 'ESTIMATED' })
    const chai = (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name: 'Masala Chai' } })).id
    await api('POST', `/households/${householdId}/meals`, { date: addDays(localToday('Asia/Kolkata'), 1), slot: 'BREAKFAST', recipeId: chai, servings: 7 }) // 700 ml

    const queue = (await api('GET', `/households/${householdId}/verification`)).body
    assert.equal(queue[0].item.ingredient.name, 'Milk')
    assert.ok(queue[0].reasons.some((r: string) => r.includes('upcoming meal')))
    assert.ok(!queue.some((q: any) => q.item.ingredient.name === 'Salt')) // confirmed and not needed

    // Spec example: recorded 800 ml, actually 300 ml, meals need 700 ml -> 400 ml shortage + notification.
    const check = await api('POST', `/households/${householdId}/pantry/${milk.body.id}/verify`, { action: 'update', quantity: 300, unit: 'ml' })
    assert.equal(check.body.affected.shortage, '400')
    const notes = (await api('GET', `/households/${householdId}/notifications`)).body
    assert.equal(notes.unread, 1)
    assert.match(notes.items[0].title, /Milk is now short for 1 planned meal/)
    assert.equal((await api('GET', `/households/${householdId}/dashboard`)).body.unreadNotifications, 1)
    await api('POST', `/households/${householdId}/notifications/read`)
    assert.equal((await api('GET', `/households/${householdId}/notifications`)).body.unread, 0)

    // Confirmed milk drops out of the queue's top spot only if nothing else outranks it; it must now say confirmed.
    const after = (await api('GET', `/households/${householdId}/verification`)).body
    assert.ok(!after.find((q: any) => q.item.ingredient.name === 'Milk')?.reasons.includes('Amount is an estimate'))
  })
})

describe('household activity alerts', () => {
  it('tells everyone else about a change, with their own unread count', async () => {
    const owner = await signUpWithHousehold('Asha')
    const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
    const partner = client()
    await partner('POST', '/auth/register', { name: 'Ravi', email: `ravi-${Date.now()}@example.com`, password: 'a-long-password' })
    await partner('POST', '/households/join', { code })
    const notes = (api: typeof partner) => api('GET', `/households/${owner.householdId}/notifications`).then(r => r.body)

    // The owner hears that Ravi joined; Ravi doesn't get told about his own actions.
    assert.deepEqual((await notes(owner.api)).items.map((n: any) => n.title), ['Ravi joined the household'])
    assert.equal((await notes(partner)).unread, 0)

    const dal = (await prisma.recipe.findFirstOrThrow({ where: { householdId: null, name: 'Dal Tadka' } })).id
    const meal = await partner('POST', `/households/${owner.householdId}/meals`, { date: addDays(localToday('Asia/Kolkata'), 1), slot: 'DINNER', recipeId: dal })
    await partner('POST', `/households/${owner.householdId}/pantry`, { ingredientId: await ingredientId('Rice'), quantity: 2, unit: 'kg' })
    const ownerView = await notes(owner.api)
    assert.equal(ownerView.unread, 3)
    assert.match(ownerView.items[1].title, /^Ravi planned Dal Tadka for dinner on /)
    assert.equal(ownerView.items[1].link.startsWith('/planner?week='), true)
    assert.deepEqual([ownerView.items[0].title, ownerView.items[0].body], ['Ravi added Rice to the pantry', '2 kg in stock.'])

    // Reading is per person: the owner clears theirs, and Ravi still sees the owner's later change as unread.
    await owner.api('POST', `/households/${owner.householdId}/notifications/read`)
    assert.equal((await notes(owner.api)).unread, 0)
    assert.equal((await notes(owner.api)).items.every((n: any) => n.read), true)
    await owner.api('POST', `/households/${owner.householdId}/meals/${meal.body.id}/cancel`)
    const ravi = await notes(partner)
    assert.equal(ravi.unread, 1)
    assert.match(ravi.items[0].title, /^Asha cancelled Dal Tadka/)
    assert.equal((await partner('GET', `/households/${owner.householdId}/dashboard`)).body.unreadNotifications, 1)
  })
})

describe('household settings, members and invites', () => {
  it('lets the owner manage settings and invite members who then share the data', async () => {
    const owner = await signUpWithHousehold('Owner', 3)
    const settings = await owner.api('PATCH', `/households/${owner.householdId}`, { name: 'Renamed kitchen', defaultServings: 5, timezone: 'Asia/Kolkata' })
    assert.deepEqual([settings.body.name, settings.body.defaultServings], ['Renamed kitchen', 5])
    assert.equal((await owner.api('PATCH', `/households/${owner.householdId}`, { timezone: 'Mars/Olympus' })).status, 400)

    const code = (await owner.api('POST', `/households/${owner.householdId}/invite-code`)).body.inviteCode
    assert.match(code, /^[A-Z2-9]{8}$/)

    const guest = client()
    await guest('POST', '/auth/register', { name: 'Guest', email: `guest-${Date.now()}@example.com`, password: 'a-long-password' })
    assert.equal((await guest('POST', '/households/join', { code: 'WRONG123' })).status, 404)
    const joined = await guest('POST', '/households/join', { code: code.toLowerCase() })
    assert.equal(joined.status, 201)
    assert.equal(joined.body.id, owner.householdId)
    assert.equal((await guest('GET', '/auth/me')).body.household.id, owner.householdId)

    // Members share data but can't change settings or members.
    await owner.api('POST', `/households/${owner.householdId}/pantry`, { ingredientId: await ingredientId('Rice'), quantity: 1, unit: 'kg' })
    assert.equal((await guest('GET', `/households/${owner.householdId}/pantry`)).body.length, 1)
    assert.equal((await guest('PATCH', `/households/${owner.householdId}`, { name: 'Mine' })).status, 403)
    assert.equal((await guest('POST', `/households/${owner.householdId}/invite-code`)).status, 403)
    const info = (await guest('GET', `/households/${owner.householdId}`)).body
    assert.deepEqual([info.members.length, info.yourRole], [2, 'MEMBER'])
    // Only the owner manages invites, so members never receive the code.
    assert.equal(info.inviteCode, null)
    assert.equal((await guest('GET', '/auth/me')).body.household.inviteCode, undefined)
    assert.equal((await owner.api('GET', `/households/${owner.householdId}`)).body.inviteCode, code)

    // Someone already in a household can't join another.
    assert.equal((await owner.api('POST', '/households/join', { code })).status, 409)

    // Disabling invites stops new joins; the owner can remove the member, who then loses access.
    await owner.api('DELETE', `/households/${owner.householdId}/invite-code`)
    const guestId = info.members.find((m: any) => m.role === 'MEMBER').id
    assert.equal((await owner.api('DELETE', `/households/${owner.householdId}/members/${guestId}`)).status, 204)
    assert.equal((await guest('GET', `/households/${owner.householdId}/pantry`)).status, 404)
  })

  it('updates the profile and changes the password', async () => {
    const api = client()
    const email = `pw-${Date.now()}@example.com`
    await api('POST', '/auth/register', { name: 'Old name', email, password: 'first-password' })
    assert.equal((await api('PATCH', '/auth/me', { name: 'New name' })).body.name, 'New name')
    assert.equal((await api('POST', '/auth/password', { currentPassword: 'wrong-password', newPassword: 'second-password' })).status, 400)
    assert.equal((await api('POST', '/auth/password', { currentPassword: 'first-password', newPassword: 'second-password' })).status, 204)
    assert.equal((await client()('POST', '/auth/login', { email, password: 'second-password' })).status, 200)
    assert.equal((await client()('POST', '/auth/login', { email, password: 'first-password' })).status, 401)
  })
})

describe('assistant', () => {
  it('falls back to deterministic answers when AI is not configured', async () => {
    const { api, householdId } = await signUpWithHousehold('Chatter', 4)
    assert.deepEqual((await api('GET', `/households/${householdId}/assistant`)).body, { configured: false, model: null, fallbackModel: null })
    const reply = await api('POST', `/households/${householdId}/assistant/messages`, { message: 'What can I cook today?', history: [] })
    assert.equal(reply.status, 200)
    assert.equal(reply.body.mode, 'fallback')
    assert.match(reply.body.reply, /isn’t set up yet/)
    assert.match(reply.body.reply, /Closest options|You can cook/)
  })

  it('resolves everyday and Hindi ingredient names to the catalog', async () => {
    const { householdId } = await signUpWithHousehold('Resolver')
    const catalog = await listIngredients(householdId)
    for (const [input, expected] of [['aloo', 'Potato'], ['Potatoes', 'Potato'], ['dahi', 'Curd'], ['milk', 'Milk'], ['atta', 'Wheat flour (atta)'], ['eggs', 'Eggs'], ['paneer', 'Paneer']]) {
      assert.equal(resolveIngredient(input!, catalog).match?.name, expected, input)
    }
    assert.equal(resolveIngredient('dragonfruit', catalog).match, null)
  })
})
