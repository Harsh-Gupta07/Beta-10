CREATE TYPE "NutritionMealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
CREATE TYPE "DietPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

ALTER TABLE "MealLog"
  ALTER COLUMN "mealSlot" TYPE "NutritionMealSlot" USING ("mealSlot"::text::"NutritionMealSlot"),
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "MealLog_idempotencyKey_key" ON "MealLog"("idempotencyKey");
CREATE UNIQUE INDEX "MealLog_plannedMealId_userId_key" ON "MealLog"("plannedMealId", "userId");

CREATE TABLE "DietPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "status" "DietPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "proposal" JSONB NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DietPlan_userId_weekStart_idx" ON "DietPlan"("userId", "weekStart");
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
