import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import { addDays, localToday, toDbDate, weekStartOf } from '../src/services/dates.js'

const prisma = new PrismaClient()
const email = process.argv[2] ?? 'code.harshgupta@gmail.com'

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: true } })
  const householdId = user.memberships[0]?.householdId
  if (!householdId) throw new Error('The account has no household.')
  const household = await prisma.household.update({ where: { id: householdId }, data: { defaultServings: 1, peopleCount: 1, appliances: ['GAS_STOVE', 'MICROWAVE', 'PRESSURE_COOKER', 'MIXER_GRINDER'], usualCookMinutes: 35 }, select: { timezone: true } })
  const catalog = new Map((await prisma.ingredient.findMany({ where: { householdId: null } })).map(i => [i.name, i]))
  const stock: Record<string, [number, number?, number?]> = { Rice: [450, 150], 'Toor dal': [300, 100], 'Moong dal': [220, 80], Milk: [1000, 250], Curd: [400, 100], Paneer: [250, 100, 1], Onion: [600, 150], Tomato: [500, 120], Potato: [800, 200], Carrot: [300, 100], Oats: [0] }
  for (const [name, [quantity, low, expiryDays]] of Object.entries(stock)) {
    const ingredient = catalog.get(name); if (!ingredient) continue
    await prisma.pantryItem.upsert({ where: { householdId_ingredientId: { householdId, ingredientId: ingredient.id } }, update: { quantity, lowStockThreshold: low ?? null, confidence: 'CONFIRMED', expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null }, create: { householdId, ingredientId: ingredient.id, quantity, unit: ingredient.canonicalUnit, lowStockThreshold: low ?? null, confidence: 'CONFIRMED', source: 'MANUAL', expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null } })
  }
  await prisma.userFoodProfile.upsert({ where: { userId: user.id }, update: { dietType: 'VEGETARIAN', allergens: [], maxSpice: 3, cuisines: ['North Indian', 'South Indian'], healthGoals: ['HIGH_PROTEIN'] }, create: { userId: user.id, dietType: 'VEGETARIAN', maxSpice: 3, cuisines: ['North Indian', 'South Indian'], healthGoals: ['HIGH_PROTEIN'] } })
  await prisma.subscriptionEntitlement.upsert({ where: { userId: user.id }, update: { plan: 'PREMIUM', status: 'ACTIVE' }, create: { userId: user.id, plan: 'PREMIUM' } })
  await prisma.nutritionProfile.upsert({ where: { userId: user.id }, update: { ageYears: 28, biologicalSex: 'MALE', heightCm: 175, weightKg: 72, activityLevel: 'MODERATE', goal: 'MUSCLE_GAIN', workoutDays: ['MON','WED','FRI','SAT'], dailyMealCount: 4, preferredCuisines: ['Indian'], calorieTarget: 2400, proteinTargetG: 140, carbsTargetG: 295, fatTargetG: 73, calculationVersion: 'demo-v1' }, create: { userId: user.id, ageYears: 28, biologicalSex: 'MALE', heightCm: 175, weightKg: 72, activityLevel: 'MODERATE', goal: 'MUSCLE_GAIN', workoutDays: ['MON','WED','FRI','SAT'], dailyMealCount: 4, preferredCuisines: ['Indian'], calorieTarget: 2400, proteinTargetG: 140, carbsTargetG: 295, fatTargetG: 73, calculationVersion: 'demo-v1', consentGivenAt: new Date() } })

  const spinach = catalog.get('Spinach')!
  let demoRecipe = await prisma.recipe.findFirst({ where: { householdId, name: 'Demo Protein Greens' } })
  if (!demoRecipe) demoRecipe = await prisma.recipe.create({ data: { householdId, name: 'Demo Protein Greens', description: 'A small demo recipe used to show cumulative shortages.', category: 'Dinner', baseServings: 1, prepMinutes: 5, cookMinutes: 10, instructions: ['Wash the greens.', 'Cook until tender.'], cuisine: 'Indian', tags: ['HIGH_PROTEIN'], ingredients: { create: { ingredientId: spinach.id, quantity: 10, unit: 'g' } } } })
  const today = localToday(household.timezone)
  for (const date of [today, addDays(today, 1)]) {
    const weekStart = toDbDate(weekStartOf(date)); const plan = await prisma.mealPlan.upsert({ where: { householdId_weekStart: { householdId, weekStart } }, update: {}, create: { householdId, weekStart } })
    const alreadyPlanned = await prisma.plannedMeal.findFirst({ where: { mealPlanId: plan.id, date: toDbDate(date), recipeId: demoRecipe.id, status: 'PLANNED' } })
    if (!alreadyPlanned) {
      const used = new Set((await prisma.plannedMeal.findMany({ where: { mealPlanId: plan.id, date: toDbDate(date), status: { not: 'CANCELLED' } }, select: { slot: true } })).map(m => m.slot))
      const slot = (['BREAKFAST', 'LUNCH', 'DINNER'] as const).find(value => !used.has(value))
      if (slot) await prisma.plannedMeal.create({ data: { mealPlanId: plan.id, recipeId: demoRecipe.id, date: toDbDate(date), slot, servings: 1 } })
      else {
        const replaceable = await prisma.plannedMeal.findFirst({ where: { mealPlanId: plan.id, date: toDbDate(date), status: 'PLANNED' }, orderBy: { createdAt: 'desc' } })
        if (!replaceable) throw new Error(`No editable meal slot on ${date} for cumulative-shortage demo.`)
        await prisma.plannedMeal.update({ where: { id: replaceable.id }, data: { recipeId: demoRecipe.id, servings: 1 } })
      }
    }
  }
  await prisma.pantryItem.deleteMany({ where: { householdId, ingredientId: spinach.id } })

  const shoppingList = await prisma.shoppingList.upsert({ where: { householdId_name: { householdId, name: 'Weekly shopping' } }, update: {}, create: { householdId } })
  for (const name of ['Banana', 'Peanuts', 'Milk']) { const ingredient = catalog.get(name)!; if (!await prisma.shoppingListItem.findFirst({ where: { shoppingListId: shoppingList.id, ingredientId: ingredient.id, status: 'NEEDED' } })) await prisma.shoppingListItem.create({ data: { shoppingListId: shoppingList.id, ingredientId: ingredient.id, name, quantity: name === 'Milk' ? 1000 : 500, unit: ingredient.canonicalUnit, source: 'MANUAL', note: 'Demo shopping item' } }) }
  const shared = await prisma.recipe.findMany({ where: { isShared: true }, take: 3 })
  if (shared[0] && !await prisma.mealLog.findFirst({ where: { userId: user.id } })) await prisma.mealLog.create({ data: { userId: user.id, recipeId: shared[0].id, mealSlot: 'LUNCH', servings: 1, source: 'MANUAL', calories: 520, proteinG: 24, carbsG: 68, fatG: 16, fibreG: 9 } })
  if (!await prisma.foodScan.findFirst({ where: { userId: user.id } })) await prisma.foodScan.createMany({ data: [
    { userId: user.id, imageReference: 'private://demo/cooked-meal', scanType: 'COOKED_MEAL', status: 'CONFIRMED', confidence: new Prisma.Decimal('.78'), rawProposal: { dish: 'Rajma chawal', estimated: true }, confirmedResult: { servings: 1 }, confirmedAt: new Date() },
    { userId: user.id, imageReference: 'private://demo/groceries', scanType: 'GROCERY', status: 'PROPOSED', confidence: new Prisma.Decimal('.82'), rawProposal: { items: ['Milk', 'Tomato', 'Rice'], estimated: true } },
  ] })
  console.log(`Demo data ready for ${email}. Spinach shortage: 10 g today + 10 g tomorrow = 20 g.`)
}

main().finally(() => prisma.$disconnect())
