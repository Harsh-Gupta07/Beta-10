import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { addPantryItem } from './pantry.js'
import type { InputUnit } from './units.js'

// "Add staples": a ready list of common Indian kitchen staples with typical amounts for a family of 3–4,
// so nobody has to type 50 ingredients. Everything added this way is marked Estimated.

type Staple = { quantity: number; unit: InputUnit; common?: true }

/** Keyed by the global catalog name (see prisma/seed.ts). `common` items start ticked. */
const STAPLES: Record<string, Staple> = {
  'Wheat flour (atta)': { quantity: 5, unit: 'kg', common: true }, 'Rice': { quantity: 5, unit: 'kg', common: true }, 'Basmati rice': { quantity: 1, unit: 'kg' },
  'Semolina (rava)': { quantity: 500, unit: 'g' }, 'Flattened rice (poha)': { quantity: 500, unit: 'g' }, 'Gram flour (besan)': { quantity: 500, unit: 'g' },
  'Toor dal': { quantity: 1, unit: 'kg', common: true }, 'Moong dal': { quantity: 500, unit: 'g', common: true }, 'Masoor dal': { quantity: 500, unit: 'g' },
  'Chana dal': { quantity: 500, unit: 'g' }, 'Rajma': { quantity: 500, unit: 'g' }, 'Kabuli chana': { quantity: 500, unit: 'g' },
  'Milk': { quantity: 1, unit: 'l', common: true }, 'Curd': { quantity: 500, unit: 'g', common: true }, 'Paneer': { quantity: 200, unit: 'g' },
  'Ghee': { quantity: 500, unit: 'ml', common: true }, 'Butter': { quantity: 100, unit: 'g' }, 'Eggs': { quantity: 6, unit: 'pcs' },
  'Onion': { quantity: 2, unit: 'kg', common: true }, 'Tomato': { quantity: 1, unit: 'kg', common: true }, 'Potato': { quantity: 2, unit: 'kg', common: true },
  'Carrot': { quantity: 500, unit: 'g' }, 'Green peas': { quantity: 250, unit: 'g' }, 'Cauliflower': { quantity: 500, unit: 'g' }, 'Capsicum': { quantity: 250, unit: 'g' },
  'Spinach': { quantity: 250, unit: 'g' }, 'French beans': { quantity: 250, unit: 'g' }, 'Green chilli': { quantity: 100, unit: 'g', common: true },
  'Ginger': { quantity: 100, unit: 'g', common: true }, 'Garlic': { quantity: 100, unit: 'g', common: true }, 'Coriander leaves': { quantity: 50, unit: 'g' },
  'Curry leaves': { quantity: 20, unit: 'g' }, 'Lemon': { quantity: 4, unit: 'pcs' }, 'Banana': { quantity: 6, unit: 'pcs' },
  'Cumin seeds': { quantity: 100, unit: 'g', common: true }, 'Mustard seeds': { quantity: 100, unit: 'g', common: true }, 'Turmeric powder': { quantity: 100, unit: 'g', common: true },
  'Red chilli powder': { quantity: 100, unit: 'g', common: true }, 'Coriander powder': { quantity: 100, unit: 'g', common: true }, 'Garam masala': { quantity: 100, unit: 'g', common: true },
  'Chole masala': { quantity: 100, unit: 'g' }, 'Asafoetida (hing)': { quantity: 50, unit: 'g' }, 'Bay leaf': { quantity: 10, unit: 'g' }, 'Salt': { quantity: 1, unit: 'kg', common: true },
  'Oil': { quantity: 1, unit: 'l', common: true }, 'Sugar': { quantity: 1, unit: 'kg', common: true }, 'Peanuts': { quantity: 250, unit: 'g' }, 'Tea leaves': { quantity: 250, unit: 'g', common: true },
}

/** Groups in the order an Indian kitchen thinks about them; anything else goes last. */
const CATEGORY_ORDER = ['Grains & Flours', 'Pulses', 'Dairy', 'Vegetables', 'Spices', 'Oils & Essentials', 'Fruits']
const categoryRank = (category: string) => { const i = CATEGORY_ORDER.indexOf(category); return i === -1 ? CATEGORY_ORDER.length : i }

/** The staples list for this household, with typical amounts and whether each is already in the pantry. */
export async function getStaples(householdId: string) {
  const [ingredients, pantry] = await Promise.all([
    prisma.ingredient.findMany({ where: { householdId: null, name: { in: Object.keys(STAPLES) } }, select: { id: true, name: true, category: true, canonicalUnit: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    prisma.pantryItem.findMany({ where: { householdId }, select: { ingredientId: true } }),
  ])
  const have = new Set(pantry.map(p => p.ingredientId))
  return [...ingredients].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name)).map(ingredient => {
    const staple = STAPLES[ingredient.name]!
    return { ingredient, suggested: { quantity: String(staple.quantity), unit: staple.unit }, common: staple.common === true, inPantry: have.has(ingredient.id) }
  })
}

export type StapleChoice = { ingredientId: string; quantity: string | number; unit: InputUnit }

/** Adds the ticked staples as Estimated stock. Items already in the pantry are skipped, not overwritten. */
export async function addStaples(householdId: string, actorUserId: string, items: StapleChoice[]) {
  if (new Set(items.map(i => i.ingredientId)).size !== items.length) throw new AppError(400, 'Each staple can only be added once.')
  const have = new Set((await prisma.pantryItem.findMany({ where: { householdId, ingredientId: { in: items.map(i => i.ingredientId) } }, select: { ingredientId: true } })).map(p => p.ingredientId))
  const added: string[] = []
  const skipped: string[] = []
  for (const item of items) {
    if (have.has(item.ingredientId)) { skipped.push(item.ingredientId); continue }
    await addPantryItem(householdId, actorUserId, { ingredientId: item.ingredientId, quantity: item.quantity, unit: item.unit, confidence: 'ESTIMATED' })
    added.push(item.ingredientId)
  }
  return { added: added.length, skipped: skipped.length }
}
