-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "NutritionGoal" AS ENUM ('MAINTAIN', 'FAT_LOSS', 'MUSCLE_GAIN', 'BALANCED');

-- CreateEnum
CREATE TYPE "MealLogSource" AS ENUM ('PLANNED', 'MANUAL', 'PHOTO');

-- CreateEnum
CREATE TYPE "FoodScanType" AS ENUM ('COOKED_MEAL', 'GROCERY');

-- CreateEnum
CREATE TYPE "FoodScanStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "NutritionProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ageYears" INTEGER NOT NULL,
    "biologicalSex" "BiologicalSex" NOT NULL,
    "heightCm" DECIMAL(6,2) NOT NULL,
    "weightKg" DECIMAL(6,2) NOT NULL,
    "activityLevel" "ActivityLevel" NOT NULL,
    "goal" "NutritionGoal" NOT NULL,
    "workoutDays" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[],
    "dailyMealCount" INTEGER NOT NULL DEFAULT 3,
    "preferredCuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calorieTarget" INTEGER NOT NULL,
    "proteinTargetG" DECIMAL(7,2) NOT NULL,
    "carbsTargetG" DECIMAL(7,2) NOT NULL,
    "fatTargetG" DECIMAL(7,2) NOT NULL,
    "customCalorieTarget" INTEGER,
    "customProteinTargetG" DECIMAL(7,2),
    "calculationVersion" TEXT NOT NULL,
    "consentGivenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientNutrition" (
    "ingredientId" TEXT NOT NULL,
    "caloriesPer100" DECIMAL(9,3) NOT NULL,
    "proteinG" DECIMAL(9,3) NOT NULL,
    "carbsG" DECIMAL(9,3) NOT NULL,
    "fatG" DECIMAL(9,3) NOT NULL,
    "fibreG" DECIMAL(9,3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientNutrition_pkey" PRIMARY KEY ("ingredientId")
);

-- CreateTable
CREATE TABLE "RecipeNutrition" (
    "recipeId" TEXT NOT NULL,
    "calories" DECIMAL(10,3) NOT NULL,
    "proteinG" DECIMAL(10,3) NOT NULL,
    "carbsG" DECIMAL(10,3) NOT NULL,
    "fatG" DECIMAL(10,3) NOT NULL,
    "fibreG" DECIMAL(10,3) NOT NULL,
    "completeness" DECIMAL(5,4) NOT NULL,
    "missingIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nutritionVersion" TEXT NOT NULL,

    CONSTRAINT "RecipeNutrition_pkey" PRIMARY KEY ("recipeId")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plannedMealId" TEXT,
    "recipeId" TEXT,
    "mealSlot" "MealSlot" NOT NULL,
    "servings" DECIMAL(6,2) NOT NULL,
    "source" "MealLogSource" NOT NULL,
    "calories" DECIMAL(10,3) NOT NULL,
    "proteinG" DECIMAL(10,3) NOT NULL,
    "carbsG" DECIMAL(10,3) NOT NULL,
    "fatG" DECIMAL(10,3) NOT NULL,
    "fibreG" DECIMAL(10,3) NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageReference" TEXT NOT NULL,
    "scanType" "FoodScanType" NOT NULL,
    "status" "FoodScanStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" DECIMAL(5,4) NOT NULL,
    "rawProposal" JSONB NOT NULL,
    "confirmedResult" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "FoodScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEntitlement" (
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionEntitlement_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionProfile_userId_key" ON "NutritionProfile"("userId");

-- CreateIndex
CREATE INDEX "MealLog_userId_loggedAt_idx" ON "MealLog"("userId", "loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodScan_idempotencyKey_key" ON "FoodScan"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FoodScan_userId_createdAt_idx" ON "FoodScan"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "NutritionProfile" ADD CONSTRAINT "NutritionProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientNutrition" ADD CONSTRAINT "IngredientNutrition_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeNutrition" ADD CONSTRAINT "RecipeNutrition_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodScan" ADD CONSTRAINT "FoodScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEntitlement" ADD CONSTRAINT "SubscriptionEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
