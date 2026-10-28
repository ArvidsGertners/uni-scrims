-- AlterTable
ALTER TABLE "user" ADD COLUMN     "oplCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oplLinkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplNextCheckAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplUserId" INTEGER;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "oplCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oplLinkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplNextCheckAt" TIMESTAMPTZ(3),
ADD COLUMN     "oplRosterOthers" INTEGER,
ADD COLUMN     "oplTeamId" INTEGER;

-- CreateTable
CREATE TABLE "OplRosterMatch" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "OplRosterMatch_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateIndex
CREATE INDEX "OplRosterMatch_userId_idx" ON "OplRosterMatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_oplUserId_key" ON "user"("oplUserId");

-- CreateIndex
CREATE INDEX "user_oplNextCheckAt_idx" ON "user"("oplNextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_oplTeamId_key" ON "Team"("oplTeamId");

-- CreateIndex
CREATE INDEX "Team_oplNextCheckAt_idx" ON "Team"("oplNextCheckAt");

-- AddForeignKey
ALTER TABLE "OplRosterMatch" ADD CONSTRAINT "OplRosterMatch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OplRosterMatch" ADD CONSTRAINT "OplRosterMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

