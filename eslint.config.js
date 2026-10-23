import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".agents/**",
      ".claude/**",
      "docs/design_handoff_uni_scrims/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "packages/db/src/generated/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Rules from CLAUDE.md / ARCHITECTURE.md.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message: "Import the Prisma client from @uni-scrims/db.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "setInterval",
          message: "Use a sequential loop (await + sleep) instead of setInterval.",
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...nextCoreWebVitals, ...nextTypescript],
    settings: { next: { rootDir: "apps/web" } },
  },
);
