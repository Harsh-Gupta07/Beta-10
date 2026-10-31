-- Deleting a recipe that history still uses now archives it instead (see Recipe.archivedAt).
ALTER TABLE "Recipe" ADD COLUMN "archivedAt" TIMESTAMP(3);
