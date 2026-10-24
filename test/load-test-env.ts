import path from "node:path";
import { config } from "dotenv";

// Loads .env (if present) and points DATABASE_URL at the test database so no test can touch the app DB.
// Only workers may trust an env already switched by the global setup; the global setup always checks.
export function loadTestEnv({ trustInherited }: { trustInherited: boolean }): void {
  config({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });
  // The admin host (ARCHITECTURE §5.13) only where a test switches it on itself.
  delete process.env.ADMIN_URL;
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  if (trustInherited && process.env.TEST_DB_ACTIVE === "true") {
    if (process.env.DATABASE_URL !== testUrl) {
      throw new Error("DATABASE_URL does not point at the test database");
    }
    return;
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DB_ACTIVE = "true";
}
