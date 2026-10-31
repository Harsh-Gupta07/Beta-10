-- CreateEnum
CREATE TYPE "AppLanguage" AS ENUM ('EN', 'HI', 'HINGLISH');

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "chammachMl" INTEGER,
ADD COLUMN     "katoriMl" INTEGER,
ADD COLUMN     "mutthiGrams" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" "AppLanguage" NOT NULL DEFAULT 'EN',
ADD COLUMN     "voiceLanguage" TEXT NOT NULL DEFAULT 'en-IN';

