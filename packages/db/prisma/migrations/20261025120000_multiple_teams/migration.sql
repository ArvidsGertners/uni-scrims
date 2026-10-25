-- CreateEnum
CREATE TYPE "TeamLimitStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "TeamMember_userId_key";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "activeTeamId" TEXT,
ADD COLUMN     "teamLimit" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "TeamLimitRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pendingUserId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "TeamLimitStatus" NOT NULL,
    "newLimit" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" TEXT,

    CONSTRAINT "TeamLimitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamLimitRequest_pendingUserId_key" ON "TeamLimitRequest"("pendingUserId");

-- CreateIndex
CREATE INDEX "TeamLimitRequest_userId_idx" ON "TeamLimitRequest"("userId");

-- CreateIndex
CREATE INDEX "TeamLimitRequest_status_createdAt_idx" ON "TeamLimitRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_activeTeamId_fkey" FOREIGN KEY ("activeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLimitRequest" ADD CONSTRAINT "TeamLimitRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLimitRequest" ADD CONSTRAINT "TeamLimitRequest_pendingUserId_fkey" FOREIGN KEY ("pendingUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLimitRequest" ADD CONSTRAINT "TeamLimitRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

