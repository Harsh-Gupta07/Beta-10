import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { prisma } from '../lib/prisma.js'
import { localToday, weekStartOf, toDbDate } from './dates.js'
import { consumePlannedMeal } from './mealLogs.js'
import { signUpWithHousehold, useTestServer } from '../test/helpers.js'

useTestServer()

describe('planned-meal consumption', () => {
  it('scales household portions, is idempotent and never changes pantry stock', async () => {
    const { householdId } = await signUpWithHousehold('Nutrition portions')
    const owner = await prisma.householdMember.findFirstOrThrow({ where: { householdId }, select: { userId: true } })
    const second = await prisma.user.create({ data: { name: 'Second diner', email: `diner-${Date.now()}@example.com`, passwordHash: 'not-used-in-this-test' } })
    await prisma.householdMember.create({ data: { householdId, userId: second.id } })
    const recipe = await prisma.recipe.findFirstOrThrow({ where: { isShared: true, nutrition: { isNot: null } } })
    const date = localToday('UTC')
    const mealPlan = await prisma.mealPlan.create({ data: { householdId, weekStart: toDbDate(weekStartOf(date)) } })
    const meal = await prisma.plannedMeal.create({ data: { mealPlanId: mealPlan.id, recipeId: recipe.id, date: toDbDate(date), slot: 'DINNER', servings: 3 } })
    const pantryBefore = await prisma.pantryItem.aggregate({ where: { householdId }, _sum: { quantity: true } })

    const first = await consumePlannedMeal(householdId, meal.id, owner.userId, [{ userId: owner.userId, servings: 1 }, { userId: second.id, servings: 2 }])
    assert.equal(first.logs.length, 2)
    const one = first.logs.find(log => log.userId === owner.userId)!, two = first.logs.find(log => log.userId === second.id)!
    assert.equal(Number(two.calories), Number(one.calories) * 2)
    assert.equal(Number(two.proteinG), Number(one.proteinG) * 2)

    await Promise.all([consumePlannedMeal(householdId, meal.id, owner.userId, [{ userId: owner.userId, servings: 1 }]), consumePlannedMeal(householdId, meal.id, owner.userId, [{ userId: owner.userId, servings: 1 }])])
    assert.equal(await prisma.mealLog.count({ where: { plannedMealId: meal.id } }), 2)
    const pantryAfter = await prisma.pantryItem.aggregate({ where: { householdId }, _sum: { quantity: true } })
    assert.equal(pantryAfter._sum.quantity?.toString() ?? '0', pantryBefore._sum.quantity?.toString() ?? '0')
  })

  it('rejects consumers outside the household', async () => {
    const { householdId } = await signUpWithHousehold('Private nutrition')
    const owner = await prisma.householdMember.findFirstOrThrow({ where: { householdId }, select: { userId: true } })
    const outsider = await prisma.user.create({ data: { name: 'Outsider', email: `outsider-${Date.now()}@example.com`, passwordHash: 'not-used-in-this-test' } })
    const recipe = await prisma.recipe.findFirstOrThrow({ where: { isShared: true } }), date = localToday('UTC')
    const plan = await prisma.mealPlan.create({ data: { householdId, weekStart: toDbDate(weekStartOf(date)) } })
    const meal = await prisma.plannedMeal.create({ data: { mealPlanId: plan.id, recipeId: recipe.id, date: toDbDate(date), slot: 'LUNCH', servings: 1 } })
    await assert.rejects(() => consumePlannedMeal(householdId, meal.id, owner.userId, [{ userId: outsider.id, servings: 1 }]), /member/)
  })
})
