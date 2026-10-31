import { Prisma, type FoodScanType, type MealSlot } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { privateImageReference, visionProvider, type ImageInput } from './foodVision.js'
import { receiveStockTx } from './pantry.js'
import { recipeNutrition } from './nutrition.js'

export async function createScan(userId: string, scanType: FoodScanType, image?: ImageInput) {
  const provider = visionProvider(image)
  const proposal = scanType === 'COOKED_MEAL' ? await provider.analyseMeal(image) : await provider.analyseGroceries(image)
  const member = await prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } })
  if (!member) throw new AppError(400, 'Join a household first.')
  const names = proposal.items.map(i => i.name.toLowerCase())
  const ingredients = await prisma.ingredient.findMany({ where: { nameKey: { in: names }, OR: [{ householdId: null }, { householdId: member.householdId }] }, select: { id: true, nameKey: true } })
  const items = proposal.items.map(i => ({ ...i, ingredientId: ingredients.find(x => x.nameKey === i.name.toLowerCase())?.id }))
  return prisma.foodScan.create({ data: { userId, imageReference: privateImageReference(), scanType, confidence: proposal.confidence, rawProposal: { ...proposal, items } } })
}

export async function getScan(userId: string, id: string) {
  const scan = await prisma.foodScan.findFirst({ where: { id, userId } })
  if (!scan) throw new AppError(404, 'Scan not found.')
  return scan
}

export async function cancelScan(userId: string, id: string) {
  const result = await prisma.foodScan.updateMany({ where: { id, userId, status: 'PROPOSED' }, data: { status: 'CANCELLED' } })
  if (!result.count) throw new AppError(409, 'This scan can no longer be cancelled.')
}

export async function confirmGrocery(userId: string, id: string, items: Array<{ ingredientId: string; quantity: number }>) {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status::text FROM "FoodScan" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`
    if (!locked.length) throw new AppError(404, 'Scan not found.')
    if (locked[0]!.status === 'CONFIRMED') return tx.foodScan.findUniqueOrThrow({ where: { id } })
    const member = await tx.householdMember.findFirstOrThrow({ where: { userId }, select: { householdId: true } })
    const received = []
    for (const item of items) received.push(await receiveStockTx(tx, member.householdId, userId, { ingredientId: item.ingredientId, quantity: new Prisma.Decimal(item.quantity), idempotencyKey: `scan:${id}:${item.ingredientId}`, note: 'Confirmed grocery photo' }))
    return tx.foodScan.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `scan:${id}`, confirmedResult: { items: received.map(x => ({ ingredientId: x.ingredient.id, quantity: x.quantity, unit: x.unit })) } } })
  })
}

export async function confirmMeal(userId: string, id: string, input: { recipeId: string; servings: number; mealSlot: MealSlot }) {
  const scan = await getScan(userId, id)
  if (scan.status === 'CONFIRMED') return scan
  const n = await recipeNutrition(input.recipeId, input.servings)
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text FROM "FoodScan" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`
    if (locked[0]?.status === 'CONFIRMED') return tx.foodScan.findUniqueOrThrow({ where: { id } })
    const log = await tx.mealLog.create({ data: { userId, recipeId: input.recipeId, mealSlot: input.mealSlot, servings: input.servings, source: 'PHOTO', calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, fibreG: n.fibreG } })
    return tx.foodScan.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: `scan:${id}`, confirmedResult: { mealLogId: log.id, recipeId: input.recipeId, servings: input.servings } } })
  })
}

