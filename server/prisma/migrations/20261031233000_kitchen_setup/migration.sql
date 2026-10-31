-- CreateEnum
CREATE TYPE "Appliance" AS ENUM ('GAS_STOVE', 'INDUCTION', 'MICROWAVE', 'AIR_FRYER', 'OVEN', 'PRESSURE_COOKER', 'MIXER_GRINDER');

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "appliances" "Appliance"[] DEFAULT ARRAY[]::"Appliance"[],
ADD COLUMN     "usualCookMinutes" INTEGER;

