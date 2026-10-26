-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'DECLINED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotifType" ADD VALUE 'DIRECT_REQUEST_RECEIVED';
ALTER TYPE "NotifType" ADD VALUE 'DIRECT_REQUEST_DECLINED';
ALTER TYPE "NotifType" ADD VALUE 'PARTNERSHIP_ENDED';

-- AlterTable
ALTER TABLE "ScrimRequest" ADD COLUMN     "targetTeamId" TEXT,
ADD COLUMN     "weeklyLastStartsAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "RequestSeries" ADD COLUMN     "targetTeamId" TEXT;

-- CreateIndex
CREATE INDEX "ScrimRequest_targetTeamId_idx" ON "ScrimRequest"("targetTeamId");

-- CreateIndex
CREATE INDEX "RequestSeries_targetTeamId_idx" ON "RequestSeries"("targetTeamId");

-- AddForeignKey
ALTER TABLE "ScrimRequest" ADD CONSTRAINT "ScrimRequest_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestSeries" ADD CONSTRAINT "RequestSeries_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

