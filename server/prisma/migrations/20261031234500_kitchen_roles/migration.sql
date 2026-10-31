-- CreateEnum
CREATE TYPE "KitchenRole" AS ENUM ('PLANNER', 'COOK', 'SHOPPER', 'STOCK_CHECKER');

-- AlterTable
ALTER TABLE "FamilyProfile" ADD COLUMN     "kitchenRoles" "KitchenRole"[] DEFAULT ARRAY[]::"KitchenRole"[];

-- AlterTable
ALTER TABLE "HouseholdMember" ADD COLUMN     "kitchenRoles" "KitchenRole"[] DEFAULT ARRAY[]::"KitchenRole"[];

