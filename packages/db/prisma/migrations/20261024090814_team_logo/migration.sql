-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "logoUpdatedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "TeamLogo" (
    "teamId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "TeamLogo_pkey" PRIMARY KEY ("teamId")
);

-- AddForeignKey
ALTER TABLE "TeamLogo" ADD CONSTRAINT "TeamLogo_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
