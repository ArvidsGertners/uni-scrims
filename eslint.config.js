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
  // UI text only from the dictionaries (ARCHITECTURE §5.21): no text in JSX besides punctuation and
  // names, and no strings that look German outside the dictionaries. The data export is German by
  // design; mails and the bot's messages are in dictionaries too since Phase 23 (§5.22).
  {
    files: ["apps/web/app/**/*.tsx", "apps/web/components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          allowedStrings: [
            "·",
            "–",
            "—",
            "…",
            "(",
            ")",
            ":",
            ",",
            ".",
            "/",
            "+",
            "×",
            "★",
            "Ø",
            "[",
            "]",
            "?",
            "%",
            "|",
            "Uni Scrims",
            "Discord",
            "Valorant",
            "Riot Games",
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/{app,components,lib}/**/*.{ts,tsx}",
      "packages/core/src/**/*.ts",
      "apps/bot/src/**/*.ts",
    ],
    ignores: [
      "apps/web/i18n/**",
      "packages/core/src/i18n/**",
      "packages/core/src/account-export.ts",
      // The bot's texts (§5.22); the scripts are the operator's tools and stay German.
      "apps/bot/src/i18n/**",
      "apps/bot/src/scripts/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["Literal[value=/[äöüÄÖÜß„]/]", "TemplateElement[value.raw=/[äöüÄÖÜß„]/]"].map(
          (selector) => ({
            selector,
            message:
              "German text belongs in a dictionary (apps/web/i18n, core/src/i18n, apps/bot/src/i18n).",
          }),
        ),
      ],
    },
  },
);
