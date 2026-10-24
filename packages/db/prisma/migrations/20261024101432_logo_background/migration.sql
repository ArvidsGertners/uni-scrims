-- CreateEnum
CREATE TYPE "LogoBackground" AS ENUM ('DARK', 'LIGHT');

-- AlterTable
ALTER TABLE "TeamLogo" DROP CONSTRAINT "TeamLogo_pkey",
ADD COLUMN     "background" "LogoBackground" NOT NULL DEFAULT 'DARK',
ADD CONSTRAINT "TeamLogo_pkey" PRIMARY KEY ("teamId", "background");

