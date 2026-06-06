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
  // Ignore bootstrap / planning commits that predate conventional-commit
  // enforcement in this repository.
  ignores: [(msg: string) => /^Initial\s/i.test(msg.trim())],
  rules: {
    // Allow up to 120 characters to accommodate descriptive feature messages.
    "header-max-length": [2, "always", 120],
  },
};

export default config;
