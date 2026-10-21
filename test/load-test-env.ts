import path from "node:path";
import { config } from "dotenv";

// Loads .env (if present) and points DATABASE_URL at the test database so no test can touch the app DB.
export function loadTestEnv(): void {
  config({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  // Workers inherit the already switched env from the global setup.
  if (process.env.TEST_DB_ACTIVE === "true") {
    return;
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DB_ACTIVE = "true";
}
