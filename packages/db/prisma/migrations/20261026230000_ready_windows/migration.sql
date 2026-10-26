-- AlterTable
ALTER TABLE "ScrimRequest" ADD COLUMN     "readyWindowId" TEXT;

-- CreateTable
CREATE TABLE "ReadyWindow" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'valorant',
    "firstStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "lastStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "format" "ScrimFormat" NOT NULL,
    "rankMin" "Rank" NOT NULL,
    "rankMax" "Rank" NOT NULL,
    "maps" TEXT[],
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReadyWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadyWindow_endedAt_lastStartsAt_idx" ON "ReadyWindow"("endedAt", "lastStartsAt");

-- CreateIndex
CREATE INDEX "ReadyWindow_teamId_idx" ON "ReadyWindow"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrimRequest_readyWindowId_teamId_key" ON "ScrimRequest"("readyWindowId", "teamId");

-- AddForeignKey
ALTER TABLE "ScrimRequest" ADD CONSTRAINT "ScrimRequest_readyWindowId_fkey" FOREIGN KEY ("readyWindowId") REFERENCES "ReadyWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadyWindow" ADD CONSTRAINT "ReadyWindow_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadyWindow" ADD CONSTRAINT "ReadyWindow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

