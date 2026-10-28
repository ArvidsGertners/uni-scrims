-- CreateTable
CREATE TABLE "OplCrawl" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "nextStepAt" TIMESTAMPTZ(3) NOT NULL,
    "cursor" JSONB NOT NULL,

    CONSTRAINT "OplCrawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniligaRegistration" (
    "crawlId" TEXT NOT NULL,
    "oplTeamId" INTEGER NOT NULL,
    "leafId" INTEGER NOT NULL,
    "division" INTEGER NOT NULL,
    "group" TEXT,

    CONSTRAINT "UniligaRegistration_pkey" PRIMARY KEY ("crawlId","oplTeamId")
);

-- CreateIndex
CREATE INDEX "OplCrawl_finishedAt_startedAt_idx" ON "OplCrawl"("finishedAt", "startedAt");

-- CreateIndex
CREATE INDEX "UniligaRegistration_oplTeamId_idx" ON "UniligaRegistration"("oplTeamId");

-- AddForeignKey
ALTER TABLE "UniligaRegistration" ADD CONSTRAINT "UniligaRegistration_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "OplCrawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

