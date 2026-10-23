// Makes an account the operator (SPEC N-4, ARCHITECTURE §5.9), the only role not given in the UI.
// The account must be complete and have a password; its sessions end, so the next visit of the
// admin area starts with the 2FA setup. On the server:
//   dc run --rm --no-deps bot node --import tsx src/scripts/set-operator.ts du@example.org
// Locally: pnpm --filter @uni-scrims/bot set-operator du@example.org
import "../env.ts";
import { isDomainError, setOperator } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";

const email = process.argv[2];
if (!email) {
  console.error("Aufruf: set-operator.ts <E-Mail-Adresse des Kontos>");
  process.exit(1);
}

try {
  const user = await setOperator(email);
  console.log(`Betreiber: ${user.name} (${user.email}). Alle Sitzungen sind beendet.`);
} catch (error) {
  if (!isDomainError(error)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
