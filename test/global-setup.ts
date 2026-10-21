import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadTestEnv } from "./load-test-env.ts";

// Resets the test database once before the whole test run.
export default function setup(): void {
  loadTestEnv({ trustInherited: false });
  execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], {
    cwd: path.resolve(import.meta.dirname, "../packages/db"),
    env: process.env,
    stdio: "inherit",
  });
}
