-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "cookMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;
