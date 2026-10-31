-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('MILK', 'EGG', 'PEANUT', 'TREE_NUT', 'GLUTEN', 'SOY', 'SESAME', 'FISH', 'SHELLFISH', 'MUSTARD');

-- CreateEnum
CREATE TYPE "DietClass" AS ENUM ('PLANT', 'DAIRY', 'EGG', 'MEAT', 'SEAFOOD');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN');

-- CreateEnum
CREATE TYPE "IngredientPrefKind" AS ENUM ('AVOID', 'LIKE');

-- CreateEnum
CREATE TYPE "RecipePrefKind" AS ENUM ('FAVOURITE', 'DISLIKE');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],
ADD COLUMN     "allergensReviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dietClass" "DietClass";

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "cuisine" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "spiceLevel" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "UserFoodProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dietType" "DietType",
    "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],
    "maxSpice" INTEGER,
    "cuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFoodProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIngredientPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "kind" "IngredientPrefKind" NOT NULL,

    CONSTRAINT "UserIngredientPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRecipePref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "RecipePrefKind" NOT NULL,

    CONSTRAINT "UserRecipePref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdFoodProfile" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "cuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usualSpice" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdFoodProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFoodProfile_userId_key" ON "UserFoodProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIngredientPref_userId_ingredientId_key" ON "UserIngredientPref"("userId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRecipePref_userId_recipeId_key" ON "UserRecipePref"("userId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdFoodProfile_householdId_key" ON "HouseholdFoodProfile"("householdId");

-- AddForeignKey
ALTER TABLE "UserFoodProfile" ADD CONSTRAINT "UserFoodProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientPref" ADD CONSTRAINT "UserIngredientPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientPref" ADD CONSTRAINT "UserIngredientPref_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecipePref" ADD CONSTRAINT "UserRecipePref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecipePref" ADD CONSTRAINT "UserRecipePref_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFoodProfile" ADD CONSTRAINT "HouseholdFoodProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

