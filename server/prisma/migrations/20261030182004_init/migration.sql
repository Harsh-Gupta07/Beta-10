-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "StockConfidence" AS ENUM ('CONFIRMED', 'ESTIMATED', 'CHECK_NEEDED');

-- CreateEnum
CREATE TYPE "StockSource" AS ENUM ('MANUAL', 'PURCHASE', 'RECIPE_DEDUCTION', 'CORRECTION', 'IMPORT');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('PLANNED', 'COOKING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('PURCHASE_RECEIVED', 'COOKING_CONSUMPTION', 'CORRECTION', 'MANUAL_USE');

-- CreateEnum
CREATE TYPE "ShoppingItemStatus" AS ENUM ('NEEDED', 'PURCHASED', 'RECEIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultServings" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "canonicalUnit" TEXT NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "confidence" "StockConfidence" NOT NULL DEFAULT 'ESTIMATED',
    "source" "StockSource" NOT NULL DEFAULT 'MANUAL',
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "baseServings" INTEGER NOT NULL DEFAULT 4,
    "prepMinutes" INTEGER NOT NULL DEFAULT 30,
    "instructions" TEXT[],
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "servings" INTEGER NOT NULL,
    "status" "MealStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealIngredientAllocation" (
    "id" TEXT NOT NULL,
    "plannedMealId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "MealIngredientAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingEvent" (
    "id" TEXT NOT NULL,
    "plannedMealId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "pantryItemId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "cookingEventId" TEXT,
    "type" "StockTransactionType" NOT NULL,
    "delta" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Weekly shopping',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "shoppingListId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'item',
    "status" "ShoppingItemStatus" NOT NULL DEFAULT 'NEEDED',
    "receivedQty" DECIMAL(12,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryVerification" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "pantryItemId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "oldQuantity" DECIMAL(12,3) NOT NULL,
    "newQuantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "PantryItem_householdId_confidence_idx" ON "PantryItem"("householdId", "confidence");

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_householdId_ingredientId_key" ON "PantryItem"("householdId", "ingredientId");

-- CreateIndex
CREATE INDEX "Recipe_householdId_name_idx" ON "Recipe"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_householdId_weekStart_key" ON "MealPlan"("householdId", "weekStart");

-- CreateIndex
CREATE INDEX "PlannedMeal_date_status_idx" ON "PlannedMeal"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedMeal_mealPlanId_date_slot_key" ON "PlannedMeal"("mealPlanId", "date", "slot");

-- CreateIndex
CREATE INDEX "MealIngredientAllocation_ingredientId_idx" ON "MealIngredientAllocation"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "MealIngredientAllocation_plannedMealId_ingredientId_key" ON "MealIngredientAllocation"("plannedMealId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "CookingEvent_plannedMealId_key" ON "CookingEvent"("plannedMealId");

-- CreateIndex
CREATE UNIQUE INDEX "CookingEvent_idempotencyKey_key" ON "CookingEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransaction_idempotencyKey_key" ON "StockTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockTransaction_householdId_createdAt_idx" ON "StockTransaction"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransaction_pantryItemId_createdAt_idx" ON "StockTransaction"("pantryItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingList_householdId_name_key" ON "ShoppingList"("householdId", "name");

-- CreateIndex
CREATE INDEX "ShoppingListItem_shoppingListId_status_idx" ON "ShoppingListItem"("shoppingListId", "status");

-- CreateIndex
CREATE INDEX "InventoryVerification_householdId_verifiedAt_idx" ON "InventoryVerification"("householdId", "verifiedAt");

-- CreateIndex
CREATE INDEX "Notification_householdId_readAt_createdAt_idx" ON "Notification"("householdId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealIngredientAllocation" ADD CONSTRAINT "MealIngredientAllocation_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealIngredientAllocation" ADD CONSTRAINT "MealIngredientAllocation_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingEvent" ADD CONSTRAINT "CookingEvent_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "PantryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_cookingEventId_fkey" FOREIGN KEY ("cookingEventId") REFERENCES "CookingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryVerification" ADD CONSTRAINT "InventoryVerification_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryVerification" ADD CONSTRAINT "InventoryVerification_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "PantryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryVerification" ADD CONSTRAINT "InventoryVerification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
