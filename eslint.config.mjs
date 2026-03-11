import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  // ── Browser / client-side files ───────────────────────────────────────────
  {
    files: [
      "app/**/*.ts",
      "app/**/*.tsx",
      "components/**/*.ts",
      "components/**/*.tsx",
      "lib/sketchgit/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // ── Node.js / server-side files ───────────────────────────────────────────
  {
    files: [
      "server.ts",
      "proxy.ts",
      "prisma.config.ts",
      "lib/env.ts",
      "lib/auth.ts",
      "lib/db/**/*.ts",
      "lib/api/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // ── TypeScript rules (all .ts / .tsx) ─────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Catch dead code
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Discourage untyped any
      "@typescript-eslint/no-explicit-any": "warn",
      // Prefer structured logging (console.log is fine in tests / scripts)
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow console in tests
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/**",
      "*.mjs",
    ],
  },
];
