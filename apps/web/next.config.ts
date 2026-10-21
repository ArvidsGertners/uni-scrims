import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root, so standalone tracing includes workspace packages.
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@uni-scrims/core", "@uni-scrims/db"],
};

export default nextConfig;
