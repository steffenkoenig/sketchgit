import type { UserConfig } from "@commitlint/types";

/**
 * Commitlint configuration – enforces Conventional Commits specification.
 *
 * Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 * Scopes are optional but encouraged, e.g.:
 *   feat(auth): add password reset flow
 *   fix(ws): handle reconnect race condition
 *
 * See .github/copilot-instructions.md for commit message examples.
 */
const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer subject lines to accommodate descriptive messages.
    "header-max-length": [2, "always", 100],
  },
};

export default config;
