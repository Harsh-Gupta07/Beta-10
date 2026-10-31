import { PrismaClient, type Allergen, type DietClass } from '@prisma/client'
import { recipeTags, recipes } from './recipes.data.js'

const prisma = new PrismaClient()

// Global ingredient catalog. Units are canonical: g (mass), ml (volume) or count (pieces).
const ingredients: Array<[name: string, category: string, canonicalUnit: 'g' | 'ml' | 'count']> = [
  ['Rice', 'Grains & Flours', 'g'], ['Basmati rice', 'Grains & Flours', 'g'], ['Wheat flour (atta)', 'Grains & Flours', 'g'],
  ['Semolina (rava)', 'Grains & Flours', 'g'], ['Flattened rice (poha)', 'Grains & Flours', 'g'], ['Gram flour (besan)', 'Grains & Flours', 'g'],
  ['Toor dal', 'Pulses', 'g'], ['Moong dal', 'Pulses', 'g'], ['Masoor dal', 'Pulses', 'g'], ['Chana dal', 'Pulses', 'g'],
  ['Rajma', 'Pulses', 'g'], ['Kabuli chana', 'Pulses', 'g'],
  ['Milk', 'Dairy', 'ml'], ['Curd', 'Dairy', 'g'], ['Paneer', 'Dairy', 'g'], ['Tofu', 'Dairy', 'g'], ['Ghee', 'Dairy', 'ml'], ['Butter', 'Dairy', 'g'], ['Eggs', 'Dairy', 'count'],
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
  // A plant-based swap for paneer.
  'Tofu': { dietClass: 'PLANT', allergens: ['SOY'] },
  'Wheat flour (atta)': { dietClass: 'PLANT', allergens: ['GLUTEN'] }, 'Semolina (rava)': { dietClass: 'PLANT', allergens: ['GLUTEN'] },
  'Peanuts': { dietClass: 'PLANT', allergens: ['PEANUT'] }, 'Mustard seeds': { dietClass: 'PLANT', allergens: ['MUSTARD'] },
  // Most packaged hing is cut with wheat flour.
  'Asafoetida (hing)': { dietClass: 'PLANT', allergens: ['GLUTEN'] },
  // Spice blends vary by brand (some contain nuts, mustard or wheat), so they stay unreviewed until checked.
  // "Oil" means refined cooking oil, which is exempt from allergen labelling; households using peanut or
  // mustard oil should add it as their own ingredient and tag it.
  'Garam masala': { dietClass: 'PLANT', allergens: [], reviewed: false }, 'Chole masala': { dietClass: 'PLANT', allergens: [], reviewed: false },
}

// Demonstration subset derived from common IFCT/pack nutrition values, per 100 canonical units.
// Production should replace/verify each row against the licensed source edition recorded below.
const nutrition: Record<string, [calories: number, protein: number, carbs: number, fat: number, fibre: number]> = {
  Rice: [356, 6.8, 78.2, 0.5, 2.8], 'Basmati rice': [356, 7.1, 78, 0.6, 2.4], 'Wheat flour (atta)': [340, 12, 72, 2, 11],
  'Toor dal': [335, 22.3, 57.6, 1.7, 15], 'Moong dal': [347, 24, 59.9, 1.2, 16], 'Masoor dal': [352, 24.6, 63.4, 1.1, 10.7], Rajma: [333, 23.6, 60, 0.8, 24.9],
  Milk: [61, 3.2, 4.8, 3.3, 0], Curd: [61, 3.5, 4.7, 3.3, 0], Paneer: [265, 18.3, 1.2, 20.8, 0], Ghee: [900, 0, 0, 100, 0], Oil: [884, 0, 0, 100, 0],
  Onion: [40, 1.1, 9.3, 0.1, 1.7], Tomato: [18, 0.9, 3.9, 0.2, 1.2], Potato: [77, 2, 17.5, 0.1, 2.2], Carrot: [41, 0.9, 9.6, 0.2, 2.8],
  Spinach: [23, 2.9, 3.6, 0.4, 2.2], Cauliflower: [25, 1.9, 5, 0.3, 2], 'Green peas': [81, 5.4, 14.5, 0.4, 5.7], Peanuts: [567, 25.8, 16.1, 49.2, 8.5],
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
  for (const [name, values] of Object.entries(nutrition)) {
    const ingredient = catalog.get(name.toLowerCase())
    if (!ingredient) continue
    const [caloriesPer100, proteinG, carbsG, fatG, fibreG] = values
    await prisma.ingredientNutrition.upsert({ where: { ingredientId: ingredient.id }, update: { caloriesPer100, proteinG, carbsG, fatG, fibreG, source: 'IFCT/common label demo subset', sourceReference: 'DEMO-IFCT-2017' }, create: { ingredientId: ingredient.id, caloriesPer100, proteinG, carbsG, fatG, fibreG, source: 'IFCT/common label demo subset', sourceReference: 'DEMO-IFCT-2017' } })
  }
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
