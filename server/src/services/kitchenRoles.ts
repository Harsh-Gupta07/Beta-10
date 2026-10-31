import type { HouseholdRole, KitchenRole } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'

// Who usually plans, cooks, shops and checks stock. These only decide what each person sees first;
// permissions still come from OWNER/MEMBER.

export const KITCHEN_ROLES = ['PLANNER', 'COOK', 'SHOPPER', 'STOCK_CHECKER'] as const satisfies readonly KitchenRole[]

export type RolesInput = {
  members: Array<{ userId: string; roles: KitchenRole[] }>
  family: Array<{ id: string; roles: KitchenRole[] }>
}

export async function getKitchenRoles(householdId: string) {
  const [members, family] = await Promise.all([
    prisma.householdMember.findMany({ where: { householdId }, select: { kitchenRoles: true, user: { select: { id: true, name: true } } }, orderBy: { joinedAt: 'asc' } }),
    prisma.familyProfile.findMany({ where: { householdId }, select: { id: true, name: true, kitchenRoles: true }, orderBy: { createdAt: 'asc' } }),
  ])
  return {
    members: members.map(m => ({ userId: m.user.id, name: m.user.name, roles: m.kitchenRoles })),
    family: family.map(f => ({ id: f.id, name: f.name, roles: f.kitchenRoles })),
  }
}

/** The owner can set everyone's jobs; anyone else may only change their own. */
export async function setKitchenRoles(householdId: string, actorUserId: string, actorRole: HouseholdRole, input: RolesInput) {
  const others = input.members.some(m => m.userId !== actorUserId) || input.family.length > 0
  if (actorRole !== 'OWNER' && others) throw new AppError(403, 'Only the household owner can choose jobs for other people. You can change your own.')
  const current = await getKitchenRoles(householdId)
  const memberIds = new Set(current.members.map(m => m.userId))
  const familyIds = new Set(current.family.map(f => f.id))
  if (input.members.some(m => !memberIds.has(m.userId)) || input.family.some(f => !familyIds.has(f.id))) throw new AppError(400, 'Some of those people aren’t in this household.')
  await prisma.$transaction([
    ...input.members.map(m => prisma.householdMember.update({ where: { householdId_userId: { householdId, userId: m.userId } }, data: { kitchenRoles: [...new Set(m.roles)] } })),
    ...input.family.map(f => prisma.familyProfile.update({ where: { id: f.id }, data: { kitchenRoles: [...new Set(f.roles)] } })),
  ])
  return getKitchenRoles(householdId)
}
