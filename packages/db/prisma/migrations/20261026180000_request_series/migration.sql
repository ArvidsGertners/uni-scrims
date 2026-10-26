-- AlterTable
ALTER TABLE "ScrimRequest" ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "RequestSeries" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'valorant',
    "format" "ScrimFormat" NOT NULL,
    "rankMin" "Rank" NOT NULL,
    "rankMax" "Rank" NOT NULL,
    "maps" TEXT[],
    "note" TEXT,
    "nextStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "lastStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestSeries_endedAt_nextStartsAt_idx" ON "RequestSeries"("endedAt", "nextStartsAt");

-- CreateIndex
CREATE INDEX "RequestSeries_teamId_idx" ON "RequestSeries"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrimRequest_seriesId_startsAt_key" ON "ScrimRequest"("seriesId", "startsAt");

-- AddForeignKey
ALTER TABLE "ScrimRequest" ADD CONSTRAINT "ScrimRequest_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "RequestSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSeries" ADD CONSTRAINT "RequestSeries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSeries" ADD CONSTRAINT "RequestSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

