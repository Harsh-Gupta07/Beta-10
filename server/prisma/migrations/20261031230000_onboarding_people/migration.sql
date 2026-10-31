-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('CHILD', 'TEEN', 'ADULT', 'SENIOR');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "peopleCount" INTEGER;

-- AlterTable
ALTER TABLE "UserFoodProfile" ADD COLUMN     "ageGroup" "AgeGroup",
ADD COLUMN     "healthGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weeklyFasts" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[];

-- CreateTable
CREATE TABLE "FamilyProfile" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageGroup" "AgeGroup",
    "dietType" "DietType",
    "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],
    "healthGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weeklyFasts" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyProfile_householdId_idx" ON "FamilyProfile"("householdId");

-- AddForeignKey
ALTER TABLE "FamilyProfile" ADD CONSTRAINT "FamilyProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Households that existed before onboarding cards were added are already set up.
UPDATE "Household" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "onboardingCompletedAt" IS NULL;
