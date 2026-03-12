# P065 – Argon2id Password Hashing Migration

## Title
Replace `bcryptjs` with `argon2` (Argon2id Variant) for Password Hashing to Improve Resistance to GPU-Based Brute-Force Attacks

## Brief Summary
The application uses `bcryptjs` (a pure-JavaScript bcrypt implementation) with cost factor 12 to hash user passwords. While bcrypt with cost 12 is considered acceptable, the `argon2` algorithm — specifically the Argon2id variant recommended by OWASP and the IETF RFC 9106 — is significantly more resistant to GPU and ASIC brute-force attacks due to its memory-hard design. Migrating to `argon2` improves the security posture of the credential storage layer with a minimal code change in `lib/db/userRepository.ts`, and the migration can be done transparently for existing users via a "re-hash on login" strategy.

## Current Situation
`lib/db/userRepository.ts` uses `bcryptjs` for password hashing:
```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;  // bcrypt cost factor

// Registration:
const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

// Verification:
const valid = await bcrypt.compare(password, user.passwordHash);
```

A comment in the file acknowledges the limitation:
```typescript
// Note: `bcryptjs` is a pure-JavaScript implementation, chosen for its
// zero-native-dependency install. For production deployments with higher
// throughput requirements, consider switching to the `bcrypt` native package
// for significantly faster hashing. The API is identical.
```

This note suggests switching to the `bcrypt` (native) package for performance, but both `bcryptjs` and `bcrypt` use the bcrypt algorithm. A more impactful security improvement is to switch to Argon2id.

### Relevant files
```
lib/db/userRepository.ts  ← bcrypt hash/compare, SALT_ROUNDS = 12
package.json               ← bcryptjs@^3.0.3 in dependencies
prisma/schema.prisma       ← User.passwordHash: String?
```

## Problem with Current Situation
1. **bcrypt is not memory-hard**: bcrypt uses a fixed ~4 KB memory footprint. Modern GPUs can compute billions of bcrypt hashes per second with sufficient parallelism, reducing the effective brute-force cost. Argon2id uses configurable memory (typically 64–256 MB), which is inherently parallelism-resistant and cannot be efficiently offloaded to GPU/ASIC hardware.
2. **Pure-JavaScript performance**: `bcryptjs` is significantly slower than the native `bcrypt` binding for the same cost factor, but this is a performance disadvantage (more CPU per login) rather than a security advantage (the algorithm remains the same). Switching to Argon2id via the `argon2` npm package (which uses native bindings) achieves both better security and better performance.
3. **OWASP recommendation**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) lists Argon2id as the first recommended algorithm (above bcrypt) for new applications, with minimum parameters of m=19456 KiB, t=2, p=1.
4. **No algorithm identifier in hash prefix**: The `passwordHash` column stores the full hash string (e.g., `$2b$12$…` for bcrypt). A migration from bcrypt to Argon2id must detect and handle both formats during a transition period, which is straightforward to implement.

## Goal to Achieve
1. Replace `bcryptjs` with the `argon2` npm package in `lib/db/userRepository.ts`.
2. Use Argon2id variant with OWASP-recommended parameters (m=65536, t=3, p=4).
3. Implement a transparent "re-hash on login" strategy: when a user logs in successfully with a bcrypt-hashed password, silently re-hash the password with Argon2id and store the updated hash.
4. New registrations use Argon2id exclusively.
5. Remove `bcryptjs` from `package.json` once all existing passwords have been migrated or after a defined transition period.

## What Needs to Be Done

### 1. Install `argon2`
```bash
npm install argon2
npm uninstall bcryptjs @types/bcryptjs
```
The `argon2` package includes TypeScript types in the package itself; no separate `@types/argon2` is needed.

### 2. Define Argon2id parameters in `userRepository.ts`
```typescript
import argon2 from 'argon2';

// Argon2id parameters — OWASP recommendation (RFC 9106 §4, level 2):
// - m: 65536 KiB (64 MB) memory
// - t: 3 iterations
// - p: 4 parallelism degree
// These values should be tuned based on the target server's available memory
// and acceptable latency (target: < 500 ms per hash on production hardware).
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
};
```

### 3. Update `createUser()` to use Argon2id
```typescript
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  // … existing email uniqueness check …
  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
  // … rest of createUser …
}
```

### 4. Update `verifyCredentials()` with transparent re-hash
```typescript
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a hash comparison to prevent timing attacks (P054 pattern preserved)
  const hashToCompare = user?.passwordHash ?? DUMMY_ARGON2_HASH;
  const isArgon2 = hashToCompare.startsWith('$argon2');

  let valid: boolean;
  if (isArgon2) {
    valid = await argon2.verify(hashToCompare, password);
  } else {
    // Legacy bcrypt hash — use bcryptjs for verification only during transition
    valid = await bcrypt.compare(password, hashToCompare);
  }

  if (!valid || !user) return null;

  // Transparent re-hash: if the password was stored as bcrypt, upgrade to Argon2id
  if (!isArgon2) {
    const newHash = await argon2.hash(password, ARGON2_OPTIONS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
  }

  return toPublicUser(user);
}
```

### 5. Update `DUMMY_HASH` for timing attack protection (P054)
The existing `DUMMY_HASH` is a bcrypt hash used to prevent user enumeration (P054). Replace it with an Argon2id dummy hash:
```typescript
// Regenerate with: node -e "require('argon2').hash('dummy-sentinel').then(console.log)"
// The Argon2id hash is ~95 characters; timing is indistinguishable from a real verify()
const DUMMY_ARGON2_HASH = '$argon2id$v=19$m=65536,t=3,p=4$…';
```

### 6. Keep `bcryptjs` as a transitional dependency
During the migration period (while existing bcrypt hashes remain in the database), keep `bcryptjs` as a dependency but mark it as transitional:
```typescript
// TRANSITIONAL: Only used to verify legacy bcrypt hashes.
// Remove bcryptjs once all users have re-hashed to Argon2id.
// Track via: SELECT COUNT(*) FROM "User" WHERE "passwordHash" LIKE '$2b%';
import bcrypt from 'bcryptjs';
```

### 7. Add a migration health metric
Add a log line in `server.ts` at startup (or a periodic cron) that counts remaining bcrypt hashes:
```typescript
const bcryptCount = await prisma.user.count({
  where: { passwordHash: { startsWith: '$2b$' } },
});
logger.info({ bcryptCount }, 'password migration progress');
```
When `bcryptCount` reaches 0, remove `bcryptjs` from `package.json`.

## What Components Are Affected

| Component | Change |
|-----------|--------|
| `package.json` | Add `argon2`; keep `bcryptjs` transitionally; remove `@types/bcryptjs` |
| `lib/db/userRepository.ts` | Replace bcrypt hash/compare with argon2; add transparent re-hash |
| `lib/db/userRepository.test.ts` | Update tests to mock `argon2.hash` / `argon2.verify`; add re-hash test |

## Additional Considerations

### Native bindings and Docker build
The `argon2` package uses native Node.js bindings (compiled C). The existing `Dockerfile` uses a multi-stage build. Ensure the build stage installs build tools (`python3`, `make`, `g++`) before running `npm ci`, or use the pre-built `argon2` npm package variant.

In the existing Dockerfile, the build base image is `node:22-alpine`. Alpine requires:
```dockerfile
RUN apk add --no-cache python3 make g++
```
This must be added before `RUN npm ci`.

### Argon2id parameters tuning
The recommended parameters (m=65536, t=3, p=4) target ~100–300 ms hash time on a 2-core cloud VM. If the production server has less memory or fewer cores, tune down `memoryCost` or `parallelism`. Add `ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, and `ARGON2_PARALLELISM` to `lib/env.ts` for operator tunability.

### bcrypt removal timeline
A 90-day transition window is recommended, enforced by a tracked milestone:
- **Day 0**: Deploy Argon2id support with re-hash-on-login enabled.
- **Day 1–90**: All active users re-hash their password to Argon2id automatically on next login.
- **Day 90 (forced sunset)**: Log the count of remaining bcrypt hashes. If `bcryptCount > 0`, send a password-reset email to affected accounts (using P040 infrastructure) with a notice that their session will expire unless they reset their password. Set a 30-day deadline.
- **Day 120**: Remove `bcryptjs` from `package.json`. Users who have not re-hashed are prompted to reset their password on their next login attempt (their stored bcrypt hash is NULLed at Day 120 via a one-time migration).

This timeline should be captured in a GitHub milestone and tracked via the `bcryptCount` log metric described above.

## Testing Requirements
- `createUser()` stores a password hash starting with `$argon2id`.
- `verifyCredentials()` with the correct password and an Argon2id hash returns the user and does not update the hash.
- `verifyCredentials()` with the correct password and a legacy bcrypt hash returns the user **and** updates the hash to Argon2id (re-hash test).
- `verifyCredentials()` with an incorrect password returns `null` for both hash formats.
- `verifyCredentials()` with a non-existent email returns `null` (timing attack protection preserved).
- The dummy hash is used when the user does not exist, preventing user enumeration.

## Dependency Map
- Builds on: P007 ✅ (authentication), P054 ✅ (constant-time verification)
- Complements: P040 ✅ (password reset — new reset tokens will be stored as Argon2id hashes)
- Independent of: Redis, Next.js build, WebSocket
