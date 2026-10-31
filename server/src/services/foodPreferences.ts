import type { AgeGroup, Allergen, DietType, HouseholdRole, Weekday } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'
import { visibleTo } from './recipes.js'
import type { MemberNeeds } from './foodSafety.js'

export type MyPreferencesInput = {
  dietType: DietType | null
  allergens: Allergen[]
  maxSpice: number | null
  cuisines: string[]
  avoidIngredientIds: string[]
  likedIngredientIds: string[]
  favouriteRecipeIds: string[]
  dislikedRecipeIds: string[]
  /** Left unchanged when omitted, so older clients that don't send them can't wipe them. */
  ageGroup?: AgeGroup | null
  healthGoals?: string[]
  weeklyFasts?: Weekday[]
}

export type FamilyProfileInput = { name: string; ageGroup: AgeGroup | null; dietType: DietType | null; allergens: Allergen[]; healthGoals: string[]; weeklyFasts: Weekday[] }

const cleanList = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]

async function householdOf(userId: string) {
  return (await prisma.householdMember.findFirst({ where: { userId }, select: { householdId: true } }))?.householdId ?? null
}

export async function getMyPreferences(userId: string) {
  const [profile, ingredientPrefs, recipePrefs] = await Promise.all([
    prisma.userFoodProfile.findUnique({ where: { userId } }),
    prisma.userIngredientPref.findMany({ where: { userId }, include: { ingredient: { select: { id: true, name: true } } }, orderBy: { ingredient: { name: 'asc' } } }),
    prisma.userRecipePref.findMany({ where: { userId }, include: { recipe: { select: { id: true, name: true } } }, orderBy: { recipe: { name: 'asc' } } }),
  ])
  return {
    dietType: profile?.dietType ?? null,
    allergens: profile?.allergens ?? [],
    maxSpice: profile?.maxSpice ?? null,
    cuisines: profile?.cuisines ?? [],
    ageGroup: profile?.ageGroup ?? null,
    healthGoals: profile?.healthGoals ?? [],
    weeklyFasts: profile?.weeklyFasts ?? [],
    avoidIngredients: ingredientPrefs.filter(pref => pref.kind === 'AVOID').map(pref => pref.ingredient),
    likedIngredients: ingredientPrefs.filter(pref => pref.kind === 'LIKE').map(pref => pref.ingredient),
    favouriteRecipes: recipePrefs.filter(pref => pref.kind === 'FAVOURITE').map(pref => pref.recipe),
    dislikedRecipes: recipePrefs.filter(pref => pref.kind === 'DISLIKE').map(pref => pref.recipe),
  }
}

/** Replaces the user's whole preference set, so the form can save in one request. */
export async function updateMyPreferences(userId: string, input: MyPreferencesInput) {
  const avoid = new Set(input.avoidIngredientIds)
  const liked = new Set(input.likedIngredientIds)
  const favourite = new Set(input.favouriteRecipeIds)
  const disliked = new Set(input.dislikedRecipeIds)
  if ([...avoid].some(id => liked.has(id))) throw new AppError(400, 'An ingredient can’t be both liked and avoided.')
  if ([...favourite].some(id => disliked.has(id))) throw new AppError(400, 'A dish can’t be both a favourite and disliked.')

  // Only ingredients and recipes the user can actually see may be referenced.
  const householdId = await householdOf(userId)
  const ingredientIds = [...avoid, ...liked]
  const recipeIds = [...favourite, ...disliked]
  const [ingredients, recipes] = await Promise.all([
    prisma.ingredient.count({ where: { id: { in: ingredientIds }, OR: [{ householdId: null }, ...(householdId ? [{ householdId }] : [])] } }),
    prisma.recipe.count({ where: { id: { in: recipeIds }, ...(householdId ? visibleTo(householdId) : { householdId: null, isShared: true }) } }),
  ])
  if (ingredients !== ingredientIds.length) throw new AppError(400, 'One of the chosen ingredients isn’t available.')
  if (recipes !== recipeIds.length) throw new AppError(400, 'One of the chosen dishes isn’t available.')

  const profile = {
    dietType: input.dietType, allergens: [...new Set(input.allergens)], maxSpice: input.maxSpice, cuisines: cleanList(input.cuisines),
    ...(input.ageGroup !== undefined ? { ageGroup: input.ageGroup } : {}),
    ...(input.healthGoals ? { healthGoals: [...new Set(input.healthGoals)] } : {}),
    ...(input.weeklyFasts ? { weeklyFasts: [...new Set(input.weeklyFasts)] } : {}),
  }
  await prisma.$transaction([
    prisma.userFoodProfile.upsert({ where: { userId }, update: profile, create: { userId, ...profile } }),
    prisma.userIngredientPref.deleteMany({ where: { userId } }),
    prisma.userIngredientPref.createMany({ data: [...[...avoid].map(ingredientId => ({ userId, ingredientId, kind: 'AVOID' as const })), ...[...liked].map(ingredientId => ({ userId, ingredientId, kind: 'LIKE' as const }))] }),
    prisma.userRecipePref.deleteMany({ where: { userId } }),
    prisma.userRecipePref.createMany({ data: [...[...favourite].map(recipeId => ({ userId, recipeId, kind: 'FAVOURITE' as const })), ...[...disliked].map(recipeId => ({ userId, recipeId, kind: 'DISLIKE' as const }))] }),
  ])
  return getMyPreferences(userId)
}

/** Each current member's hard rules. Removed members drop out automatically because only memberships are read. */
export async function householdNeeds(householdId: string): Promise<MemberNeeds[]> {
  const members = await prisma.householdMember.findMany({
    where: { householdId },
    select: { user: { select: { id: true, name: true, foodProfile: { select: { dietType: true, allergens: true } }, ingredientPrefs: { where: { kind: 'AVOID' }, select: { ingredientId: true } } } } },
    orderBy: { joinedAt: 'asc' },
  })
  // People without a login count too; their ids are prefixed so they can never match a user id.
  const family = await prisma.familyProfile.findMany({ where: { householdId }, select: { id: true, name: true, dietType: true, allergens: true }, orderBy: { createdAt: 'asc' } })
  return [
    ...members.map(({ user }) => ({
      id: user.id,
      name: user.name,
      dietType: user.foodProfile?.dietType ?? null,
      allergens: user.foodProfile?.allergens ?? [],
      avoidIngredientIds: user.ingredientPrefs.map(pref => pref.ingredientId),
    })),
    ...family.map(person => ({ id: `family:${person.id}`, name: person.name, dietType: person.dietType, allergens: person.allergens, avoidIngredientIds: [] })),
  ]
}

// ---- Family profiles (people without a login) ----

const familySelect = { id: true, name: true, ageGroup: true, dietType: true, allergens: true, healthGoals: true, weeklyFasts: true } as const
const familyData = (input: FamilyProfileInput) => ({
  name: input.name.trim(), ageGroup: input.ageGroup, dietType: input.dietType,
  allergens: [...new Set(input.allergens)], healthGoals: [...new Set(input.healthGoals)], weeklyFasts: [...new Set(input.weeklyFasts)],
})

export const listFamily = (householdId: string) =>
  prisma.familyProfile.findMany({ where: { householdId }, select: familySelect, orderBy: { createdAt: 'asc' } })

export async function addFamilyProfile(householdId: string, input: FamilyProfileInput) {
  if (await prisma.familyProfile.count({ where: { householdId } }) >= 20) throw new AppError(400, 'A household can have up to 20 family profiles.')
  return prisma.familyProfile.create({ data: { householdId, ...familyData(input) }, select: familySelect })
}

export async function updateFamilyProfile(householdId: string, id: string, input: FamilyProfileInput) {
  const { count } = await prisma.familyProfile.updateMany({ where: { id, householdId }, data: familyData(input) })
  if (!count) throw new AppError(404, 'Family profile not found.')
  return prisma.familyProfile.findUniqueOrThrow({ where: { id }, select: familySelect })
}

export async function deleteFamilyProfile(householdId: string, id: string) {
  const { count } = await prisma.familyProfile.deleteMany({ where: { id, householdId } })
  if (!count) throw new AppError(404, 'Family profile not found.')
}

/** Sets or clears one dish preference, for the quick "Love it" / "Don't suggest for me" buttons. */
export async function setRecipePref(userId: string, recipeId: string, kind: 'FAVOURITE' | 'DISLIKE' | null) {
  const householdId = await householdOf(userId)
  const visible = await prisma.recipe.count({ where: { id: recipeId, ...(householdId ? visibleTo(householdId) : { householdId: null, isShared: true }) } })
  if (!visible) throw new AppError(404, 'Recipe not found.')
  if (kind) await prisma.userRecipePref.upsert({ where: { userId_recipeId: { userId, recipeId } }, update: { kind }, create: { userId, recipeId, kind } })
  else await prisma.userRecipePref.deleteMany({ where: { userId, recipeId } })
  return { recipeId, kind }
}

/** What the household cooks for: owner defaults plus every member's hard rules. Likes and favourites stay with each person. */
export async function getHouseholdFoodProfile(householdId: string) {
  const [profile, members, family] = await Promise.all([
    prisma.householdFoodProfile.findUnique({ where: { householdId } }),
    prisma.householdMember.findMany({
      where: { householdId },
      select: { user: { select: { id: true, name: true, foodProfile: { select: { dietType: true, allergens: true } }, ingredientPrefs: { where: { kind: 'AVOID' }, select: { ingredient: { select: { id: true, name: true } } } } } } },
      orderBy: { joinedAt: 'asc' },
    }),
    listFamily(householdId),
  ])
  return {
    cuisines: profile?.cuisines ?? [],
    usualSpice: profile?.usualSpice ?? null,
    family,
    members: members.map(({ user }) => ({
      id: user.id, name: user.name,
      dietType: user.foodProfile?.dietType ?? null,
      allergens: user.foodProfile?.allergens ?? [],
      avoidIngredients: user.ingredientPrefs.map(pref => pref.ingredient),
    })),
  }
}

export async function updateHouseholdFoodProfile(householdId: string, role: HouseholdRole, input: { cuisines: string[]; usualSpice: number | null }) {
  if (role !== 'OWNER') throw new AppError(403, 'Only the household owner can change household food defaults.')
  const data = { cuisines: cleanList(input.cuisines), usualSpice: input.usualSpice }
  await prisma.householdFoodProfile.upsert({ where: { householdId }, update: data, create: { householdId, ...data } })
  return getHouseholdFoodProfile(householdId)
}
