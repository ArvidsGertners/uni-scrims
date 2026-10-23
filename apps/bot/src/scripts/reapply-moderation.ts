// After restoring a database backup (README, "Wiederherstellen"): applies bans and account deletions
// again that the old database had and the restored one lacks (ARCHITECTURE §8). Reads the export
// from stdin, so it needs no access to the file (the bot runs as another user than the operator):
//   dc run --rm --no-deps -T -e UPLOAD_DIR=/data/uploads bot \
//     node --import tsx src/scripts/reapply-moderation.ts < moderation.json
import "../env.ts";
import { text } from "node:stream/consumers";
import { reapplyModeration, resolveUploadDir } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";

if (process.stdin.isTTY) {
  console.error("Aufruf: reapply-moderation.ts < moderation.json");
  process.exit(1);
}

try {
  const report = await reapplyModeration({
    entries: JSON.parse(await text(process.stdin)),
    // The bot has no upload volume: files of removed verifications are deleted by the web janitor
    // (orphan step) within a day.
    uploadDir: resolveUploadDir(),
    now: new Date(),
  });
  console.log("Nachgezogen:", report);
} finally {
  await prisma.$disconnect();
}
