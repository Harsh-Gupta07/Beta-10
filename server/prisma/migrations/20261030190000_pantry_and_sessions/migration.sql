ALTER TYPE "StockTransactionType" ADD VALUE 'INITIAL_STOCK';
ALTER TYPE "StockTransactionType" ADD VALUE 'REMOVED';

-- DropForeignKey
ALTER TABLE "InventoryVerification" DROP CONSTRAINT "InventoryVerification_pantryItemId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransaction" DROP CONSTRAINT "StockTransaction_pantryItemId_fkey";

-- DropIndex
DROP INDEX "Ingredient_name_key";

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "householdId" TEXT,
ADD COLUMN     "nameKey" TEXT;
UPDATE "Ingredient" SET "nameKey" = lower(trim("name"));
ALTER TABLE "Ingredient" ALTER COLUMN "nameKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "InventoryVerification" ALTER COLUMN "pantryItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PantryItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lowStockThreshold" DECIMAL(12,3);

-- AlterTable (no pantry writes existed before this migration, so the table is empty)
ALTER TABLE "StockTransaction" ADD COLUMN     "balanceAfter" DECIMAL(12,3) NOT NULL,
ADD COLUMN     "ingredientId" TEXT NOT NULL,
ALTER COLUMN "pantryItemId" DROP NOT NULL;

-- CreateTable (IF NOT EXISTS: earlier builds let connect-pg-simple create it at runtime)
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session"("expire");

-- CreateIndex
CREATE INDEX "Ingredient_nameKey_idx" ON "Ingredient"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_householdId_nameKey_key" ON "Ingredient"("householdId", "nameKey");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "PantryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryVerification" ADD CONSTRAINT "InventoryVerification_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "PantryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

