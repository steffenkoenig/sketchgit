/**
 * P057 – Server-side validation for incoming commit WebSocket messages.
 *
 * Pure functions (no DB access, no side-effects) extracted from server.ts
 * so they can be unit-tested without loading the full server stack.
 */

/** Maximum allowed canvas JSON size in characters (≈ 2 MB for ASCII JSON). */
export const MAX_CANVAS_CHARS = 2 * 1024 * 1024;

/**
 * Validate the fields of an incoming `commit` WebSocket message.
 * Returns true if the message is safe to persist and relay; false otherwise.
 *
 * @param sha    – The commit SHA from the message (untrusted input).
 * @param commit – The commit payload object from the message (untrusted input).
 * @param log    – Called with a human-readable reason when validation fails.
 */
export function validateCommitMessage(
  sha: unknown,
  commit: unknown,
  log: (reason: string) => void,
): boolean {
  // SHA: lowercase hex string, 8–64 characters
  if (typeof sha !== "string" || !/^[0-9a-f]{8,64}$/.test(sha)) {
    log(`invalid sha: ${String(sha).slice(0, 80)}`);
    return false;
  }

  if (typeof commit !== "object" || commit === null) {
    log("commit is not an object");
    return false;
  }

  const c = commit as Record<string, unknown>;

  // Canvas: must be a string within the size limit
  if (typeof c.canvas !== "string") {
    log("canvas is not a string");
    return false;
  }
  if (c.canvas.length > MAX_CANVAS_CHARS) {
    log(`canvas too large: ${c.canvas.length} chars (max ${MAX_CANVAS_CHARS})`);
    return false;
  }

  // Canvas must be valid JSON
  try {
    JSON.parse(c.canvas);
  } catch {
    log("canvas is not valid JSON");
    return false;
  }

  // parents: array of at most 2 valid SHAs
  if (c.parents !== undefined) {
    if (!Array.isArray(c.parents)) {
      log("parents is not an array");
      return false;
    }
    if (c.parents.length > 2) {
      log(`too many parents: ${c.parents.length} (max 2)`);
      return false;
    }
    for (const p of c.parents) {
      if (typeof p !== "string" || !/^[0-9a-f]{8,64}$/.test(p)) {
        log(`invalid parent sha: ${String(p).slice(0, 80)}`);
        return false;
      }
    }
  }

  return true;
}
