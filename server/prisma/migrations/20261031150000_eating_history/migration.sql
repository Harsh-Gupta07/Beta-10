-- CreateTable
CREATE TABLE "EatenLog" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EatenLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealAbsence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plannedMealId" TEXT,
    "eatenLogId" TEXT,

    CONSTRAINT "MealAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSnooze" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "snoozedById" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EatenLog_householdId_date_slot_key" ON "EatenLog"("householdId", "date", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "MealAbsence_plannedMealId_userId_key" ON "MealAbsence"("plannedMealId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MealAbsence_eatenLogId_userId_key" ON "MealAbsence"("eatenLogId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationSnooze_householdId_recipeId_key" ON "RecommendationSnooze"("householdId", "recipeId");

-- AddForeignKey
ALTER TABLE "EatenLog" ADD CONSTRAINT "EatenLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EatenLog" ADD CONSTRAINT "EatenLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EatenLog" ADD CONSTRAINT "EatenLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAbsence" ADD CONSTRAINT "MealAbsence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAbsence" ADD CONSTRAINT "MealAbsence_plannedMealId_fkey" FOREIGN KEY ("plannedMealId") REFERENCES "PlannedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAbsence" ADD CONSTRAINT "MealAbsence_eatenLogId_fkey" FOREIGN KEY ("eatenLogId") REFERENCES "EatenLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnooze" ADD CONSTRAINT "RecommendationSnooze_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnooze" ADD CONSTRAINT "RecommendationSnooze_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnooze" ADD CONSTRAINT "RecommendationSnooze_snoozedById_fkey" FOREIGN KEY ("snoozedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An absence belongs to exactly one planned meal or one logged meal.
ALTER TABLE "MealAbsence" ADD CONSTRAINT "MealAbsence_one_meal" CHECK (("plannedMealId" IS NULL) <> ("eatenLogId" IS NULL));
