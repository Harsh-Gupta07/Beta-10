import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { listIngredients, listPantry } from './pantry.js'
import { getRecipe, listRecipes } from './recipes.js'
import type { SafetyStatus } from './foodSafety.js'
import { getWeek } from './planner.js'
import { localToday } from './dates.js'
import { describeQuantity, INPUT_UNITS, isCanonicalUnit, toCanonical, unitsFor, type InputUnit } from './units.js'

// The assistant interprets language and explains. Every quantity, scaling, allocation and stock change
// comes from the deterministic services below; anything that would change data is returned as an
// action the user must confirm in the UI.

export type ChatTurn = { role: 'user' | 'assistant'; text: string }

export type AssistantAction =
  | { id: string; type: 'ADD_STOCK'; ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit; summary: string }
  | { id: string; type: 'ADD_TO_SHOPPING'; items: Array<{ ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit }>; summary: string }
  | { id: string; type: 'RECIPE_DRAFT'; draft: RecipeDraft; summary: string }

export type RecipeDraft = {
  name: string; category: string; description: string; baseServings: number; prepMinutes: number; cookMinutes: number; instructions: string[]
  ingredients: Array<{ ingredientId: string; ingredientName: string; quantity: string; unit: InputUnit; note: string }>
  unresolved: string[]
}

type Ingredient = Awaited<ReturnType<typeof listIngredients>>[number]
type Context = { householdId: string; actions: AssistantAction[]; ingredients: Ingredient[] }

// ---- Ingredient name resolution (deterministic) ----

const SYNONYMS: Record<string, string> = {
  aloo: 'potato', potatoes: 'potato', tomatoes: 'tomato', onions: 'onion', pyaz: 'onion', pyaaz: 'onion', tamatar: 'tomato',
  chawal: 'rice', dahi: 'curd', yogurt: 'curd', yoghurt: 'curd', atta: 'wheat flour (atta)', 'wheat flour': 'wheat flour (atta)',
  besan: 'gram flour (besan)', rava: 'semolina (rava)', sooji: 'semolina (rava)', suji: 'semolina (rava)', poha: 'flattened rice (poha)',
  hing: 'asafoetida (hing)', egg: 'eggs', anda: 'eggs', chana: 'kabuli chana', chickpeas: 'kabuli chana', 'kidney beans': 'rajma',
  palak: 'spinach', gobi: 'cauliflower', matar: 'green peas', peas: 'green peas', haldi: 'turmeric powder', jeera: 'cumin seeds',
  dhaniya: 'coriander leaves', coriander: 'coriander leaves', cilantro: 'coriander leaves', chilli: 'green chilli', chillies: 'green chilli',
  doodh: 'milk', chai: 'tea leaves', tea: 'tea leaves', cheeni: 'sugar', namak: 'salt', lemons: 'lemon', nimbu: 'lemon', bananas: 'banana',
}

export function resolveIngredient(name: string, catalog: Ingredient[]): { match: Ingredient | null; candidates: string[] } {
  const key = name.trim().toLowerCase()
  const byName = new Map(catalog.map(i => [i.name.toLowerCase(), i]))
  const target = SYNONYMS[key] ?? key
  const exact = byName.get(target) ?? byName.get(target.replace(/(es|s)$/, ''))
  if (exact) return { match: exact, candidates: [] }
  const partial = catalog.filter(i => i.name.toLowerCase().includes(target) || target.includes(i.name.toLowerCase()))
  if (partial.length === 1) return { match: partial[0]!, candidates: [] }
  return { match: null, candidates: partial.slice(0, 5).map(i => i.name) }
}

function resolveQuantity(ingredient: Ingredient, quantity: unknown, rawUnit: unknown) {
  const unit = String(rawUnit ?? '').trim().toLowerCase().replace(/^(grams?|gm|gms)$/, 'g').replace(/^(kgs?|kilograms?|kilos?)$/, 'kg')
    .replace(/^(millilitres?|milliliters?)$/, 'ml').replace(/^(litres?|liters?|ltr)$/, 'l').replace(/^(pieces?|pc|nos?|count)$/, 'pcs')
  if (!(INPUT_UNITS as readonly string[]).includes(unit)) {
    return { error: `"${rawUnit}" is not a measurable unit. Ask the user how much that is in ${isCanonicalUnit(ingredient.canonicalUnit) ? unitsFor(ingredient.canonicalUnit).join(' or ') : 'g, ml or pcs'} (for example, the size printed on the packet). Do not guess.` }
  }
  try {
    const canonical = toCanonical(String(quantity), unit as InputUnit, ingredient.canonicalUnit as 'g')
    if (canonical.isZero()) return { error: 'Quantity must be more than zero.' }
    return { unit: unit as InputUnit, canonical }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That quantity is not valid.' }
  }
}

// ---- Tools ----

const STR = { type: 'STRING' } as const
const NUM = { type: 'NUMBER' } as const

const toolDeclarations = [
  { name: 'get_pantry', description: 'List every ingredient in the household pantry with quantity, stock status (OK/LOW/OUT), confidence and expiry.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'get_recipes', description: 'List available recipes with category, time, and how many ingredients the pantry is missing at the household’s usual servings (missing_count 0 = can cook now).', parameters: { type: 'OBJECT', properties: { search: { ...STR, description: 'Optional text to filter by name or category' } } } },
  { name: 'get_recipe', description: 'Get one recipe scaled to a number of servings, with each ingredient quantity and whether the pantry has enough. Use this for "how much X do I need for N people".', parameters: { type: 'OBJECT', properties: { recipe_name: STR, servings: { ...NUM, description: 'Defaults to the household’s usual servings' } }, required: ['recipe_name'] } },
  { name: 'find_recipes_using', description: 'Rank recipes that use the given ingredients, best pantry coverage first.', parameters: { type: 'OBJECT', properties: { ingredients: { type: 'ARRAY', items: STR } }, required: ['ingredients'] } },
  { name: 'get_meal_plan', description: 'Get the planned meals for the week containing a date, each with per-ingredient required, reserved and short quantities, plus all upcoming shortages. Use this to explain shortages.', parameters: { type: 'OBJECT', properties: { date: { ...STR, description: 'YYYY-MM-DD; defaults to today' } } } },
  { name: 'propose_pantry_addition', description: 'Propose adding stock the user says they have or bought. Does NOT change anything; the user confirms with a button. Only call with a concrete quantity in g, kg, ml, l or pcs.', parameters: { type: 'OBJECT', properties: { ingredient_name: STR, quantity: NUM, unit: { ...STR, description: 'g, kg, ml, l or pcs' } }, required: ['ingredient_name', 'quantity', 'unit'] } },
  { name: 'propose_shopping_items', description: 'Propose adding items to the shopping list. Does NOT change anything; the user confirms with a button.', parameters: { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { ingredient_name: STR, quantity: NUM, unit: STR }, required: ['ingredient_name', 'quantity', 'unit'] } } }, required: ['items'] } },
  { name: 'draft_recipe', description: 'Create a recipe draft for the user to review and save. Use catalog ingredient names and g, kg, ml, l or pcs quantities for the given servings.', parameters: { type: 'OBJECT', properties: {
    name: STR, category: STR, description: STR, servings: NUM, prep_minutes: NUM, cook_minutes: NUM,
    ingredients: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: STR, quantity: NUM, unit: STR, note: STR }, required: ['name', 'quantity', 'unit'] } },
    steps: { type: 'ARRAY', items: STR },
  }, required: ['name', 'servings', 'ingredients', 'steps'] } },
]

/** What the AI may know about a recipe's fit: reasons only, never which member they belong to. */
function suitability(safety: { status: SafetyStatus; conflicts: Array<{ reason: string }>; uncertain: string[] }) {
  return {
    suitability: safety.status.toLowerCase(),
    ...(safety.conflicts.length ? { avoid_because: [...new Set(safety.conflicts.map(c => c.reason))] } : {}),
    ...(safety.status === 'UNKNOWN' ? { unchecked: safety.uncertain } : {}),
  }
}

async function findRecipeId(householdId: string, name: string) {
  const { recipes } = await listRecipes(householdId)
  const key = name.trim().toLowerCase()
  return (recipes.find(r => r.name.toLowerCase() === key) ?? recipes.find(r => r.name.toLowerCase().includes(key) || key.includes(r.name.toLowerCase())))?.id ?? null
}

async function runTool(name: string, args: Record<string, any>, ctx: Context): Promise<Record<string, unknown>> {
  const { householdId } = ctx
  switch (name) {
    case 'get_pantry': {
      const items = await listPantry(householdId)
      return { items: items.map(i => ({ name: i.ingredient.name, quantity: describeQuantity(i.quantity, i.unit), status: i.status, confidence: i.confidence, expiry: i.expiry })) }
    }
    case 'get_recipes': {
      const { recipes, servings } = await listRecipes(householdId)
      const q = String(args.search ?? '').toLowerCase()
      return { usual_servings: servings, recipes: recipes.filter(r => !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)).map(r => ({ name: r.name, category: r.category, minutes: r.prepMinutes + r.cookMinutes, missing_count: r.missingCount, ingredient_count: r.ingredientCount, ...suitability(r.safety) })) }
    }
    case 'get_recipe': {
      const id = await findRecipeId(householdId, String(args.recipe_name ?? ''))
      if (!id) return { error: `No recipe called "${args.recipe_name}". Call get_recipes to see what exists.` }
      const servings = Number.isInteger(args.servings) && args.servings > 0 && args.servings <= 50 ? args.servings : undefined
      const recipe = await getRecipe(householdId, id, servings)
      return { name: recipe.name, servings: recipe.servings, written_for: recipe.baseServings, minutes: recipe.prepMinutes + recipe.cookMinutes,
        ingredients: recipe.ingredients.map(l => ({ name: l.ingredient.name, quantity: describeQuantity(l.quantity, l.unit), in_pantry: l.inPantry === null ? 'none' : describeQuantity(l.inPantry, l.unit), enough: l.enough, short_by: l.enough ? null : describeQuantity(l.missing, l.unit) })),
        steps: recipe.instructions, ...suitability(recipe.safety) }
    }
    case 'find_recipes_using': {
      const wanted = (Array.isArray(args.ingredients) ? args.ingredients : []).map((n: unknown) => resolveIngredient(String(n), ctx.ingredients).match).filter(Boolean) as Ingredient[]
      if (!wanted.length) return { error: 'None of those ingredients are in the catalog.' }
      const { recipes } = await listRecipes(householdId)
      const lines = await prisma.recipeIngredient.findMany({ where: { recipeId: { in: recipes.map(r => r.id) }, ingredientId: { in: wanted.map(w => w.id) } }, select: { recipeId: true, ingredientId: true } })
      const matches = new Map<string, number>()
      for (const line of lines) matches.set(line.recipeId, (matches.get(line.recipeId) ?? 0) + 1)
      return { searched_for: wanted.map(w => w.name), recipes: recipes.filter(r => matches.has(r.id)).sort((a, b) => matches.get(b.id)! - matches.get(a.id)! || a.missingCount - b.missingCount)
        .slice(0, 8).map(r => ({ name: r.name, uses: matches.get(r.id), missing_from_pantry: r.missingCount, minutes: r.prepMinutes + r.cookMinutes, ...suitability(r.safety) })) }
    }
    case 'get_meal_plan': {
      const date = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : undefined
      const week = await getWeek(householdId, date)
      return { today: week.today, week: `${week.weekStart} to ${week.weekEnd}`,
        meals: week.meals.map(m => ({ date: m.date, slot: m.slot, recipe: m.recipe.name, servings: m.servings, status: m.status,
          short_ingredients: m.lines.filter(l => l.shortage && l.shortage !== '0').map(l => ({ name: l.ingredient.name, needed: describeQuantity(l.required, l.unit), reserved_from_pantry: describeQuantity(l.allocated ?? '0', l.unit), short_by: describeQuantity(l.shortage!, l.unit) })) })),
        upcoming_shortages: week.shortages.map(s => ({ ingredient: s.ingredient.name, have: describeQuantity(s.onHand, s.unit), need_for_all_meals: describeQuantity(s.required, s.unit), short_by: describeQuantity(s.shortage, s.unit), first_affected: `${s.firstAffected.recipeName} (${s.firstAffected.slot.toLowerCase()} on ${s.firstAffected.date})`, earlier_meals_reserved: describeQuantity(s.allocated, s.unit) })),
        how_allocation_works: 'Stock is reserved for meals in date and slot order; later meals get what is left. Planning never deducts stock.' }
    }
    case 'propose_pantry_addition': {
      const { match, candidates } = resolveIngredient(String(args.ingredient_name ?? ''), ctx.ingredients)
      if (!match) return { error: `Unknown ingredient "${args.ingredient_name}".`, ask_user_to_choose_from: candidates }
      const q = resolveQuantity(match, args.quantity, args.unit)
      if ('error' in q) return { error: q.error }
      const pantry = await prisma.pantryItem.findUnique({ where: { householdId_ingredientId: { householdId, ingredientId: match.id } }, select: { quantity: true } })
      const summary = `Add ${describeQuantity(q.canonical, match.canonicalUnit)} ${match.name}${pantry ? ` (now ${describeQuantity(pantry.quantity, match.canonicalUnit)} → ${describeQuantity(pantry.quantity.plus(q.canonical), match.canonicalUnit)})` : ' (new pantry item)'}`
      ctx.actions.push({ id: randomUUID(), type: 'ADD_STOCK', ingredientId: match.id, ingredientName: match.name, quantity: String(args.quantity), unit: q.unit, summary })
      return { status: 'awaiting_user_confirmation', summary, note: 'Nothing has changed yet. Tell the user to press Confirm on the card.' }
    }
    case 'propose_shopping_items': {
      const items: Extract<AssistantAction, { type: 'ADD_TO_SHOPPING' }>['items'] = []
      const problems: string[] = []
      for (const raw of Array.isArray(args.items) ? args.items : []) {
        const { match, candidates } = resolveIngredient(String(raw?.ingredient_name ?? ''), ctx.ingredients)
        if (!match) { problems.push(`Unknown ingredient "${raw?.ingredient_name}"${candidates.length ? ` (did you mean ${candidates.join(', ')}?)` : ''}`); continue }
        const q = resolveQuantity(match, raw.quantity, raw.unit)
        if ('error' in q) { problems.push(`${match.name}: ${q.error}`); continue }
        items.push({ ingredientId: match.id, ingredientName: match.name, quantity: String(raw.quantity), unit: q.unit })
      }
      if (items.length) ctx.actions.push({ id: randomUUID(), type: 'ADD_TO_SHOPPING', items, summary: `Add ${items.length} item${items.length === 1 ? '' : 's'} to the shopping list` })
      return { status: items.length ? 'awaiting_user_confirmation' : 'nothing_proposed', proposed: items.map(i => `${i.quantity} ${i.unit} ${i.ingredientName}`), problems }
    }
    case 'draft_recipe': {
      const ingredients: RecipeDraft['ingredients'] = []
      const unresolved: string[] = []
      for (const raw of Array.isArray(args.ingredients) ? args.ingredients : []) {
        const { match } = resolveIngredient(String(raw?.name ?? ''), ctx.ingredients)
        const q = match ? resolveQuantity(match, raw.quantity, raw.unit) : null
        if (!match || !q || 'error' in q || ingredients.some(i => i.ingredientId === match.id)) { unresolved.push(`${raw?.quantity ?? ''} ${raw?.unit ?? ''} ${raw?.name ?? ''}`.trim()); continue }
        ingredients.push({ ingredientId: match.id, ingredientName: match.name, quantity: String(raw.quantity), unit: q.unit, note: String(raw.note ?? '').slice(0, 80) })
      }
      const servings = Math.min(50, Math.max(1, Math.round(Number(args.servings) || 4)))
      const draft: RecipeDraft = {
        name: String(args.name ?? 'New recipe').slice(0, 80), category: String(args.category ?? 'Other').slice(0, 40), description: String(args.description ?? '').slice(0, 500),
        baseServings: servings, prepMinutes: Math.max(0, Math.round(Number(args.prep_minutes) || 0)), cookMinutes: Math.max(0, Math.round(Number(args.cook_minutes) || 0)),
        instructions: (Array.isArray(args.steps) ? args.steps : []).map((s: unknown) => String(s).slice(0, 1000)).slice(0, 40), ingredients, unresolved,
      }
      ctx.actions.push({ id: randomUUID(), type: 'RECIPE_DRAFT', draft, summary: `Review recipe draft: ${draft.name}` })
      return { status: 'draft_ready_for_review', ingredients_matched: ingredients.length, not_in_catalog: unresolved, note: 'The user must review and save it; it is not saved yet.' }
    }
    default:
      return { error: `Unknown tool ${name}` }
  }
}

// ---- Gemini ----

type Part = { text?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thought?: boolean; thoughtSignature?: string }
type Content = { role: 'user' | 'model'; parts: Part[] }

class AiUnavailable extends Error {
  /** Overload, rate limit, timeout or server error: worth retrying on another model. */
  constructor(message: string, readonly transient = false) { super(message) }
}

async function callGemini(model: string, contents: Content[], system: string): Promise<Content> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY! },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations: toolDeclarations }], generationConfig: { temperature: 0.4 } }),
    signal: AbortSignal.timeout(25000),
  }).catch(error => { throw new AiUnavailable(error instanceof Error && error.name === 'TimeoutError' ? 'the AI service took too long to answer' : 'the AI service could not be reached', true) })
  const body = await response.json().catch(() => ({})) as { candidates?: Array<{ content?: Content; finishReason?: string }>; error?: { message?: string; status?: string } }
  if (!response.ok) {
    console.error('Gemini error', model, response.status, body.error?.status, body.error?.message)
    const transient = response.status === 429 || response.status >= 500
    throw new AiUnavailable(response.status === 429 ? 'the AI usage limit was reached' : response.status === 503 ? 'the AI service is overloaded' : response.status === 400 || response.status === 403 || response.status === 404 ? 'the AI key or model is not accepted' : `the AI service returned an error (${response.status})`, transient)
  }
  const content = body.candidates?.[0]?.content
  if (!content?.parts?.length) throw new AiUnavailable(`the AI returned no answer (${body.candidates?.[0]?.finishReason ?? 'empty'})`)
  return { role: 'model', parts: content.parts }
}

function systemPrompt(household: { name: string; defaultServings: number; timezone: string }) {
  return [
    `You are the KitchenSync kitchen assistant for the household "${household.name}". Today is ${localToday(household.timezone)}. They usually cook for ${household.defaultServings}.`,
    'Help with Indian home cooking: what to cook, recipe quantities, pantry stock, meal-plan shortages and shopping.',
    'Rules:',
    '- Always use tools to look up pantry, recipes, plans and shortages. Never invent stock levels, quantities or recipe amounts; report the numbers tools return.',
    '- Quantity maths (scaling, allocations, shortages) is done by the tools. Do not recalculate it yourself.',
    '- You cannot change data. propose_pantry_addition, propose_shopping_items and draft_recipe only create cards the user confirms. Never say something was added or saved; say it is ready to confirm.',
    '- Units must be g, kg, ml, l or pcs. If the user says packets, cups, bowls, handfuls or similar, ask what that is in a real unit (e.g. "How many ml is one packet?") before proposing anything.',
    '- If an ingredient name is ambiguous or unknown, ask the user to choose.',
    '- When explaining a shortage, name only the ingredients the tools report as short, with their short_by amounts, and mention that earlier meals are served first. Do not claim the pantry is empty unless get_pantry shows that.',
    '- Each recipe has a suitability from the tools. Never suggest a "conflict" recipe; if the user asks for one, explain the avoid_because reasons. For "unknown", mention what is unchecked. Never decide yourself whether a dish is safe for an allergy.',
    '- Be concise and friendly. Use short paragraphs or bullet points. Use the household’s usual servings unless told otherwise.',
  ].join('\n')
}

// ---- Offline fallback ----

async function fallbackReply(householdId: string, message: string, reason: string | null) {
  const intro = reason ? `The AI assistant is unavailable right now (${reason}). Here’s what I can tell you from your kitchen data:` : 'The AI assistant isn’t set up yet (no API key), so I can only answer a few things directly from your kitchen data:'
  const text = message.toLowerCase()
  if (/short|missing|why|need to buy|shopping/.test(text)) {
    const week = await getWeek(householdId)
    const lines = week.shortages.slice(0, 6).map(s => `• ${s.ingredient.name}: short ${describeQuantity(s.shortage, s.unit)} (first needed for ${s.firstAffected.recipeName}, ${s.firstAffected.slot.toLowerCase()} on ${s.firstAffected.date})`)
    return `${intro}\n\n${lines.length ? `Upcoming shortages:\n${lines.join('\n')}\n\nOpen the Shopping list to add them in one tap.` : 'Your pantry covers every upcoming planned meal.'}`
  }
  const { recipes: all, servings } = await listRecipes(householdId)
  // Dishes that clash with a member's allergy or diet are never suggested.
  const recipes = all.filter(r => r.safety.status !== 'CONFLICT')
  const ready = recipes.filter(r => r.missingCount === 0)
  const close = [...recipes].sort((a, b) => a.missingCount - b.missingCount).slice(0, 3)
  if (/cook|make|suggest|dinner|lunch|breakfast|eat|recipe/.test(text)) {
    return `${intro}\n\n${ready.length ? `You can cook these for ${servings} with what’s in your pantry:\n${ready.slice(0, 6).map(r => `• ${r.name} (${r.prepMinutes + r.cookMinutes} min)`).join('\n')}` : `Nothing can be cooked entirely from your pantry yet. Closest options:\n${close.map(r => `• ${r.name}: missing ${r.missingCount} ingredient${r.missingCount === 1 ? '' : 's'}`).join('\n')}`}`
  }
  return `${intro}\n\nTry “What can I cook today?” or “What am I short of?”. You can always add stock in Pantry, plan meals in the Meal Planner and manage the Shopping list directly.`
}

// ---- Entry point ----

export function assistantStatus() {
  return { configured: Boolean(env.AI_API_KEY), model: env.AI_API_KEY ? env.AI_MODEL : null, fallbackModel: env.AI_API_KEY ? env.AI_FALLBACK_MODEL : null }
}

export async function chat(householdId: string, history: ChatTurn[], message: string) {
  if (!env.AI_API_KEY) return { mode: 'fallback' as const, reply: await fallbackReply(householdId, message, null), actions: [] }
  const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { name: true, defaultServings: true, timezone: true } })
  const ingredients = await listIngredients(householdId)
  const system = systemPrompt(household)
  const conversation: Content[] = [
    ...history.slice(-10).map(turn => ({ role: turn.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  // One full answer with one model. Tool-call turns carry model-specific thought signatures, so a model
  // switch must restart the answer rather than continue another model's half-finished exchange.
  const answer = async (model: string) => {
    const ctx: Context = { householdId, actions: [], ingredients }
    const contents = [...conversation]
    for (let step = 0; step < 6; step++) {
      const reply = await callGemini(model, contents, system)
      contents.push(reply) // keep the model's parts verbatim (including thought signatures) for the next turn
      const calls = reply.parts.filter(p => p.functionCall).map(p => p.functionCall!)
      if (!calls.length) {
        const text = reply.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim()
        return { mode: 'ai' as const, reply: text || 'Done. Check the card below.', actions: ctx.actions }
      }
      const responses: Part[] = []
      for (const call of calls) {
        const result = await runTool(call.name, call.args ?? {}, ctx).catch(error => ({ error: error instanceof Error ? error.message : 'Tool failed' }))
        responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: result } })
      }
      contents.push({ role: 'user', parts: responses })
    }
    return { mode: 'ai' as const, reply: 'That took more steps than expected. Could you ask in a simpler way?', actions: ctx.actions }
  }

  try {
    try { return await answer(env.AI_MODEL) }
    catch (error) {
      // Overloaded, rate-limited or slow: try the whole answer once on the fallback model.
      if (error instanceof AiUnavailable && error.transient && env.AI_FALLBACK_MODEL !== env.AI_MODEL) return await answer(env.AI_FALLBACK_MODEL)
      throw error
    }
  } catch (error) {
    if (error instanceof AiUnavailable) return { mode: 'fallback' as const, reply: await fallbackReply(householdId, message, error.message), actions: [] }
    throw error
  }
}
