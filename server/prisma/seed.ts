import { PrismaClient, type Allergen, type DietClass } from '@prisma/client'
import { recipeTags, recipes } from './recipes.data.js'

const prisma = new PrismaClient()

// Global ingredient catalog. Units are canonical: g (mass), ml (volume) or count (pieces).
const ingredients: Array<[name: string, category: string, canonicalUnit: 'g' | 'ml' | 'count']> = [
  ['Rice', 'Grains & Flours', 'g'], ['Basmati rice', 'Grains & Flours', 'g'], ['Wheat flour (atta)', 'Grains & Flours', 'g'],
  ['Semolina (rava)', 'Grains & Flours', 'g'], ['Flattened rice (poha)', 'Grains & Flours', 'g'], ['Gram flour (besan)', 'Grains & Flours', 'g'],
  ['Toor dal', 'Pulses', 'g'], ['Moong dal', 'Pulses', 'g'], ['Masoor dal', 'Pulses', 'g'], ['Chana dal', 'Pulses', 'g'],
  ['Rajma', 'Pulses', 'g'], ['Kabuli chana', 'Pulses', 'g'],
  ['Milk', 'Dairy', 'ml'], ['Curd', 'Dairy', 'g'], ['Paneer', 'Dairy', 'g'], ['Ghee', 'Dairy', 'ml'], ['Butter', 'Dairy', 'g'], ['Eggs', 'Dairy', 'count'],
  ['Onion', 'Vegetables', 'g'], ['Tomato', 'Vegetables', 'g'], ['Potato', 'Vegetables', 'g'], ['Carrot', 'Vegetables', 'g'],
  ['Green peas', 'Vegetables', 'g'], ['Cauliflower', 'Vegetables', 'g'], ['Capsicum', 'Vegetables', 'g'], ['Spinach', 'Vegetables', 'g'],
  ['French beans', 'Vegetables', 'g'], ['Green chilli', 'Vegetables', 'g'], ['Ginger', 'Vegetables', 'g'], ['Garlic', 'Vegetables', 'g'],
  ['Coriander leaves', 'Vegetables', 'g'], ['Curry leaves', 'Vegetables', 'g'], ['Lemon', 'Fruits', 'count'], ['Banana', 'Fruits', 'count'],
  ['Cumin seeds', 'Spices', 'g'], ['Mustard seeds', 'Spices', 'g'], ['Turmeric powder', 'Spices', 'g'], ['Red chilli powder', 'Spices', 'g'],
  ['Coriander powder', 'Spices', 'g'], ['Garam masala', 'Spices', 'g'], ['Chole masala', 'Spices', 'g'], ['Asafoetida (hing)', 'Spices', 'g'],
  ['Bay leaf', 'Spices', 'g'], ['Salt', 'Spices', 'g'],
  ['Oil', 'Oils & Essentials', 'ml'], ['Sugar', 'Oils & Essentials', 'g'], ['Peanuts', 'Oils & Essentials', 'g'], ['Tea leaves', 'Oils & Essentials', 'g'],
]

// Anything not listed is a plain plant food with no allergens, and counts as reviewed.
const foodTags: Record<string, { dietClass: DietClass; allergens: Allergen[]; reviewed?: false }> = {
  'Milk': { dietClass: 'DAIRY', allergens: ['MILK'] }, 'Curd': { dietClass: 'DAIRY', allergens: ['MILK'] },
  'Paneer': { dietClass: 'DAIRY', allergens: ['MILK'] }, 'Ghee': { dietClass: 'DAIRY', allergens: ['MILK'] },
  'Butter': { dietClass: 'DAIRY', allergens: ['MILK'] }, 'Eggs': { dietClass: 'EGG', allergens: ['EGG'] },
  'Wheat flour (atta)': { dietClass: 'PLANT', allergens: ['GLUTEN'] }, 'Semolina (rava)': { dietClass: 'PLANT', allergens: ['GLUTEN'] },
  'Peanuts': { dietClass: 'PLANT', allergens: ['PEANUT'] }, 'Mustard seeds': { dietClass: 'PLANT', allergens: ['MUSTARD'] },
  // Most packaged hing is cut with wheat flour.
  'Asafoetida (hing)': { dietClass: 'PLANT', allergens: ['GLUTEN'] },
  // Spice blends vary by brand (some contain nuts, mustard or wheat), so they stay unreviewed until checked.
  // "Oil" means refined cooking oil, which is exempt from allergen labelling; households using peanut or
  // mustard oil should add it as their own ingredient and tag it.
  'Garam masala': { dietClass: 'PLANT', allergens: [], reviewed: false }, 'Chole masala': { dietClass: 'PLANT', allergens: [], reviewed: false },
}

async function main() {
  for (const [name, category, canonicalUnit] of ingredients) {
    const nameKey = name.toLowerCase()
    const tags = foodTags[name]
    const food = { dietClass: tags?.dietClass ?? 'PLANT', allergens: tags?.allergens ?? [], allergensReviewed: tags?.reviewed ?? true }
    const existing = await prisma.ingredient.findFirst({ where: { householdId: null, nameKey } })
    if (existing) {
      if (existing.canonicalUnit !== canonicalUnit) console.warn(`Keeping ${name} in ${existing.canonicalUnit}; seed says ${canonicalUnit}. Changing units of existing stock needs a data migration.`)
      await prisma.ingredient.update({ where: { id: existing.id }, data: { name, category, ...food } })
    } else {
      await prisma.ingredient.create({ data: { name, nameKey, category, canonicalUnit, ...food } })
    }
  }
  console.log(`Seeded ${ingredients.length} canonical ingredients.`)

  // Shared recipes are matched by name and refreshed in place so planned meals keep their recipe ids.
  const catalog = new Map((await prisma.ingredient.findMany({ where: { householdId: null } })).map(i => [i.nameKey, i]))
  for (const recipe of recipes) {
    const lines = recipe.ingredients.map(([name, quantity, note], position) => {
      const ingredient = catalog.get(name.toLowerCase())
      if (!ingredient) throw new Error(`Recipe "${recipe.name}" uses unknown ingredient "${name}".`)
      if (ingredient.canonicalUnit === 'count' && !Number.isInteger(quantity)) throw new Error(`Recipe "${recipe.name}": ${name} must be a whole number.`)
      return { ingredientId: ingredient.id, quantity, unit: ingredient.canonicalUnit, note: note ?? '', position }
    })
    const tags = recipeTags[recipe.name] ?? { cuisine: '', spiceLevel: null, tags: [] }
    const data = { name: recipe.name, description: recipe.description, category: recipe.category, baseServings: recipe.baseServings, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, instructions: recipe.instructions, isShared: true, ...tags }
    const existing = await prisma.recipe.findFirst({ where: { householdId: null, name: recipe.name } })
    await prisma.$transaction(async tx => {
      const saved = existing ? await tx.recipe.update({ where: { id: existing.id }, data }) : await tx.recipe.create({ data })
      await tx.recipeIngredient.deleteMany({ where: { recipeId: saved.id } })
      await tx.recipeIngredient.createMany({ data: lines.map(line => ({ ...line, recipeId: saved.id })) })
    })
  }
  console.log(`Seeded ${recipes.length} shared recipes.`)
}

main().finally(() => prisma.$disconnect())
