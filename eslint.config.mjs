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
  // ── P036: Enforce structured logging abstraction in lib/sketchgit/** ──────
  // Direct console.warn / console.error calls are disallowed; use
  // lib/sketchgit/logger.ts instead so log levels can be controlled at runtime.
  // The logger.ts file itself is explicitly excluded (it must call console.*).
  {
    files: ["lib/sketchgit/**/*.ts"],
    ignores: ["lib/sketchgit/logger.ts"],
    rules: {
      "no-console": ["warn", { allow: [] }],
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
      // P042 – Prevent silent async failures: every Promise must be awaited,
      // .catch()-handled, or explicitly void-prefixed (intentional fire-and-forget).
      "@typescript-eslint/no-floating-promises": ["error", {
        ignoreVoid: true,   // `void someAsync()` is allowed for intentional fire-and-forget
        ignoreIIFE: true,   // `(async () => { … })()` at module top-level is allowed
      }],
      // Companion rule: prevent passing async functions to callbacks that don't
      // handle returned promises (e.g. array.forEach(async fn)).
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: {
          attributes: false, // don't require awaiting JSX event handlers (common React pattern)
        },
      }],
    },
  },
  // logger.ts is the console abstraction itself – allow all console.* calls.
  // This override must come AFTER the global TypeScript rules block so it takes precedence.
  {
    files: ["lib/sketchgit/logger.ts"],
    rules: {
      "no-console": "off",
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
      // Test files commonly use async mock implementations which trigger
      // no-misused-promises; suppress it for test code.
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/**",
      "*.mjs",
      "e2e/**",
      "playwright.config.ts",
    ],
  },
];
