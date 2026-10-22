// After restoring a database backup (README, "Wiederherstellen"): applies bans and account deletions
// again that the old database had and the restored one lacks (ARCHITECTURE §8).
// Usage in production: dc run --rm --no-deps -v "$PWD/moderation.json:/tmp/moderation.json:ro" bot \
//   node --import tsx src/scripts/reapply-moderation.ts /tmp/moderation.json
import "../env.ts";
import { readFile } from "node:fs/promises";
import { reapplyModeration, resolveUploadDir } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";

const file = process.argv[2];
if (!file) {
  console.error("Aufruf: reapply-moderation.ts <export.json>");
  process.exit(1);
}

try {
  const report = await reapplyModeration({
    entries: JSON.parse(await readFile(file, "utf8")),
    // The bot has no upload volume: files of removed verifications are deleted by the web janitor
    // (orphan step) within a day.
    uploadDir: resolveUploadDir(),
    now: new Date(),
  });
  console.log("Nachgezogen:", report);
} finally {
  await prisma.$disconnect();
}
