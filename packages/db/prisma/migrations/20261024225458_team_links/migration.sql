-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "discordUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "linksUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "twitchUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ADD COLUMN     "xUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;
