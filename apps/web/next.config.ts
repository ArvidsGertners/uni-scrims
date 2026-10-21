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
  experimental: {
    // Verification uploads are up to 5 MB (ARCHITECTURE §5.2); the default limit is 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Security headers for all pages (ARCHITECTURE §7); HSTS is set in Caddy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
