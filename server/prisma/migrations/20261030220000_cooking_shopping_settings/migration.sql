-- CookingEvent was never written before this migration (cooking mode is introduced here), so the
-- required actorUserId column needs no backfill.
-- AlterTable
ALTER TABLE "CookingEvent" ADD COLUMN     "actorUserId" TEXT NOT NULL,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "inviteCode" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT;

-- AlterTable
ALTER TABLE "PlannedMeal" ADD COLUMN     "cookingStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "purchasedAt" TIMESTAMP(3),
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "Household_inviteCode_key" ON "Household"("inviteCode");

-- AddForeignKey
ALTER TABLE "CookingEvent" ADD CONSTRAINT "CookingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

