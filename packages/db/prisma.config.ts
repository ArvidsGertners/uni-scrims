import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env automatically. Variables already set (e.g. in Docker) take precedence.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Optional so that `prisma generate` works without a database (Docker build).
    url: process.env.DATABASE_URL,
  },
});
