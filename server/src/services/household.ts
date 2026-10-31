import { randomInt } from 'node:crypto'
import type { Appliance, HouseholdRole } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError, notFound } from '../lib/errors.js'
import { isValidTimeZone } from './dates.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I

function assertOwner(role: HouseholdRole) {
  if (role !== 'OWNER') throw new AppError(403, 'Only the household owner can do that.')
}

export async function getHousehold(householdId: string, role: HouseholdRole) {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { id: true, name: true, defaultServings: true, timezone: true, inviteCode: true, createdAt: true, peopleCount: true, appliances: true, usualCookMinutes: true,
      members: { select: { role: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } } },
  })
  return { ...household, members: household.members.map(({ user, role, joinedAt }) => ({ ...user, role, joinedAt })), yourRole: role }
}

export async function updateHousehold(householdId: string, role: HouseholdRole, input: { name?: string; defaultServings?: number; timezone?: string; appliances?: Appliance[]; usualCookMinutes?: number | null }) {
  assertOwner(role)
  if (input.timezone && !isValidTimeZone(input.timezone)) throw new AppError(400, 'Choose a valid timezone.')
  const data = { ...input, ...(input.appliances ? { appliances: [...new Set(input.appliances)] } : {}) }
  return prisma.household.update({ where: { id: householdId }, data, select: { id: true, name: true, defaultServings: true, timezone: true, appliances: true, usualCookMinutes: true } })
}

export async function createInviteCode(householdId: string, role: HouseholdRole) {
  assertOwner(role)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    try { return (await prisma.household.update({ where: { id: householdId }, data: { inviteCode: code }, select: { inviteCode: true } })).inviteCode }
    catch (error) { if (!(typeof error === 'object' && error && 'code' in error && error.code === 'P2002')) throw error }
  }
  throw new AppError(500, 'Could not create an invite code. Please try again.')
}

export async function disableInvites(householdId: string, role: HouseholdRole) {
  assertOwner(role)
  await prisma.household.update({ where: { id: householdId }, data: { inviteCode: null } })
}

/** Phase 1 keeps one household per user, so joining is only possible before creating or joining another. */
export async function joinHousehold(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/[\s-]/g, '')
  const existing = await prisma.householdMember.findFirst({ where: { userId } })
  if (existing) throw new AppError(409, 'You already belong to a household.')
  const household = await prisma.household.findUnique({ where: { inviteCode: code }, select: { id: true, name: true, defaultServings: true } })
  if (!household) throw new AppError(404, 'That invite code isn’t valid. Ask the household owner for a new one.')
  await prisma.householdMember.create({ data: { householdId: household.id, userId, role: 'MEMBER' } })
  return household
}

export async function removeMember(householdId: string, role: HouseholdRole, actorUserId: string, userId: string) {
  assertOwner(role)
  if (userId === actorUserId) throw new AppError(400, 'Owners can’t remove themselves.')
  const membership = await prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } })
  if (!membership) throw notFound('Member')
  await prisma.householdMember.delete({ where: { id: membership.id } })
}
