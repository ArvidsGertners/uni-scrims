-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PLAYER', 'SUBSTITUTE', 'COACH');

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "role" "MemberRole" NOT NULL DEFAULT 'PLAYER';
