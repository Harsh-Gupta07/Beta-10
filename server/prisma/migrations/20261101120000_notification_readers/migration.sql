-- Household alerts get an author and per-person read state (it used to be one read flag for everyone).
ALTER TABLE "Notification" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Anything already read counts as read by everyone who was a member at the time.
UPDATE "Notification" n SET "readBy" = ARRAY(SELECT m."userId" FROM "HouseholdMember" m WHERE m."householdId" = n."householdId")
WHERE n."readAt" IS NOT NULL;

DROP INDEX "Notification_householdId_readAt_createdAt_idx";
ALTER TABLE "Notification" DROP COLUMN "readAt";
CREATE INDEX "Notification_householdId_createdAt_idx" ON "Notification"("householdId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
