import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname, "../..");

// Next only reads apps/web/.env*; load the monorepo .env explicitly. Variables already set take precedence.
config({ path: path.join(root, ".env"), quiet: true });

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root, so standalone tracing includes workspace packages.
  outputFileTracingRoot: root,
  transpilePackages: ["@uni-scrims/core", "@uni-scrims/db"],
};

export default nextConfig;
