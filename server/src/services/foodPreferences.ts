import type { Allergen, DietType, HouseholdRole } from '@prisma/client'
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
}

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

  const profile = { dietType: input.dietType, allergens: [...new Set(input.allergens)], maxSpice: input.maxSpice, cuisines: cleanList(input.cuisines) }
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
    select: { user: { select: { name: true, foodProfile: { select: { dietType: true, allergens: true } }, ingredientPrefs: { where: { kind: 'AVOID' }, select: { ingredientId: true } } } } },
    orderBy: { joinedAt: 'asc' },
  })
  return members.map(({ user }) => ({
    name: user.name,
    dietType: user.foodProfile?.dietType ?? null,
    allergens: user.foodProfile?.allergens ?? [],
    avoidIngredientIds: user.ingredientPrefs.map(pref => pref.ingredientId),
  }))
}

/** What the household cooks for: owner defaults plus every member's hard rules. Likes and favourites stay with each person. */
export async function getHouseholdFoodProfile(householdId: string) {
  const [profile, members] = await Promise.all([
    prisma.householdFoodProfile.findUnique({ where: { householdId } }),
    prisma.householdMember.findMany({
      where: { householdId },
      select: { user: { select: { id: true, name: true, foodProfile: { select: { dietType: true, allergens: true } }, ingredientPrefs: { where: { kind: 'AVOID' }, select: { ingredient: { select: { id: true, name: true } } } } } } },
      orderBy: { joinedAt: 'asc' },
    }),
  ])
  return {
    cuisines: profile?.cuisines ?? [],
    usualSpice: profile?.usualSpice ?? null,
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
