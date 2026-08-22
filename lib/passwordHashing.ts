/**
 * lib/passwordHashing.ts
 *
 * Shared Argon2id password hashing (OWASP / RFC 9106 §4 level 2), extracted
 * from lib/db/userRepository.ts (P065) so room passwords (P093) use the
 * identical, already-audited parameters rather than a second copy that
 * could drift. Lives at the lib/ root (not lib/db/ or lib/server/) since
 * it's a leaf crypto utility both layers depend on — see the module-
 * boundary convention (lib/db/ repositories, lib/server/ business logic
 * calling into them; neither should import the other directly).
 *
 * Argon2id parameters:
 *   memoryCost: 65536 KiB (64 MB)  — GPU-resistant memory hardness
 *   timeCost:   3 iterations
 *   parallelism: 4 threads
 * Target latency: ~200–500 ms on commodity server hardware.
 */
import argon2 from "argon2";

export const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPasswordHash(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
