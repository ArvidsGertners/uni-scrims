-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('DE', 'EN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "locale" "Locale";
