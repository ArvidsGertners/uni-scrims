import { readFileSync } from "node:fs";
import path from "node:path";
import { config, parse } from "dotenv";

const envPath = path.resolve(import.meta.dirname, "../.env");

// Loads .env and points DATABASE_URL at the test database so no test can touch the app DB.
export function loadTestEnv(): void {
  config({ path: envPath, quiet: true });
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is not set");
  }
  // Compare against the app DB URL from the file: process.env.DATABASE_URL may already point
  // at the test DB (workers inherit it from the global setup).
  const appUrl = parse(readFileSync(envPath)).DATABASE_URL;
  if (testUrl === appUrl) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
  process.env.DATABASE_URL = testUrl;
}
