# P054 – Constant-time Credential Verification to Prevent User Enumeration

## Title
Fix Timing Side-channel in `verifyCredentials` That Allows Attackers to Enumerate Registered Email Addresses

## Brief Summary
The `verifyCredentials` function in `lib/db/userRepository.ts` returns `null` immediately when the provided email address is not found in the database (`user` is `null`). When a registered email with the wrong password is provided, the function proceeds to `bcrypt.compare()`, which takes ~100–200 ms (bcrypt cost factor 12). An attacker can measure response time to distinguish "email not found" from "wrong password", enabling systematic enumeration of all registered email addresses without triggering a rate limit for false positives.

## Current Situation
```typescript
// lib/db/userRepository.ts
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;   // ← immediate return: < 1ms

  const valid = await bcrypt.compare(password, user.passwordHash);  // ← ~100–200ms
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name, image: user.image, createdAt: user.createdAt };
}
```

**Attack scenario**:
1. Attacker sends `POST /api/auth/signin` with `email=victim@example.com` and a random password.
2. If the email is **not registered**: server responds in `< 10ms` (DB lookup only).
3. If the email is **registered** (wrong password): server responds in `~150ms` (DB lookup + bcrypt compare).
4. By measuring response times across thousands of email addresses, the attacker can enumerate all registered users without hitting the rate limit (each request legitimately "fails" with 401, not 429).

**Why the rate limiter doesn't fully protect against this**: The rate limit in `proxy.ts` is per-IP per-path (default: 10 requests per 60s). With a large botnet distributing probes across many IPs, or with a patient attacker sending 10 probes per minute from one IP, the timing attack allows enumeration without ever triggering a 429.

This class of vulnerability is documented in [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) as a requirement to use constant-time comparison to avoid leaking information about registered accounts.

## Goal to Achieve
1. When the email is not found, perform a dummy `bcrypt.compare()` call against a pre-computed constant hash to make the response time indistinguishable from a failed password comparison.
2. The dummy compare must execute against a real bcrypt hash (not a plaintext comparison) to consume the same ~100–200ms.
3. The fix should be in `verifyCredentials` only; no API surface changes, no schema changes.

## What Needs to Be Done

### 1. Add a module-level dummy hash constant to `userRepository.ts`
```typescript
/**
 * A pre-computed bcrypt hash of the string "dummy-password-to-prevent-timing-attacks".
 * Used in verifyCredentials() to ensure constant-time behaviour when the email
 * is not found: we always perform a bcrypt.compare() regardless of whether
 * the user exists, so that response time does not reveal which emails are registered.
 *
 * Cost factor 12 (same as SALT_ROUNDS) ensures timing is equivalent.
 * This hash is intentionally hardcoded and public – it is not a secret.
 */
const DUMMY_HASH = "$2b$12$dummyhashpadding.exampleXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
// Re-generate with: node -e "const b=require('bcryptjs'); b.hash('dummy',12).then(console.log)"
```

At module load time, pre-compute the dummy hash once:
```typescript
// Computed at module load time so the first request is not slower than subsequent ones.
const DUMMY_HASH_PROMISE = bcrypt.hash("dummy-password-to-prevent-timing-attacks", SALT_ROUNDS);
let DUMMY_HASH: string;
DUMMY_HASH_PROMISE.then(h => { DUMMY_HASH = h; });
```

Or more simply, use a hardcoded bcrypt hash literal:
```typescript
// Hardcoded bcrypt hash (cost 12) of "dummy-password-to-prevent-timing-attacks".
// This is a public constant – it is not a secret.
const DUMMY_HASH =
  "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW";
```

### 2. Update `verifyCredentials` to always run bcrypt.compare
```typescript
export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare to prevent timing-based user enumeration.
  // If the user doesn't exist, compare against a dummy hash (which will always
  // fail), but the time taken is indistinguishable from a real wrong-password check.
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !user.passwordHash || !valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt,
  };
}
```

**Key properties of this fix**:
- When the user doesn't exist: `bcrypt.compare(password, DUMMY_HASH)` runs (always false) — ~100–200ms.
- When the user exists but password is wrong: `bcrypt.compare(password, user.passwordHash)` runs (false) — ~100–200ms.
- When credentials are correct: `bcrypt.compare(password, user.passwordHash)` runs (true) — ~100–200ms.
- All three paths take approximately the same time.

### 3. Notes on the dummy hash
The dummy hash value is:
- A valid bcrypt hash string that bcryptjs can parse without error.
- Computed with the same cost factor (12) as real password hashes, so timing is equivalent.
- Not a secret: even if an attacker reads the source code and knows the dummy hash, they still cannot distinguish "user exists, wrong password" from "user doesn't exist" by timing (both paths now take the same time).

To generate a fresh dummy hash:
```bash
node -e "const b = require('bcryptjs'); b.hash('dummy-password-to-prevent-timing-attacks', 12).then(console.log)"
```

### 4. Tests
```typescript
// lib/db/userRepository.test.ts
it('verifyCredentials: always runs bcrypt.compare regardless of user existence', async () => {
  // Mock prisma.user.findUnique to return null (user not found)
  // Mock bcrypt.compare to track if it was called
  const compareSpy = vi.spyOn(bcrypt, 'compare');
  await verifyCredentials('notfound@example.com', 'anypassword');
  expect(compareSpy).toHaveBeenCalledOnce();
  expect(compareSpy).toHaveBeenCalledWith('anypassword', DUMMY_HASH);
});

it('verifyCredentials: returns null when user not found (even though bcrypt runs)', async () => {
  prisma.user.findUnique = vi.fn().mockResolvedValue(null);
  const result = await verifyCredentials('notfound@example.com', 'anypassword');
  expect(result).toBeNull();
});

it('verifyCredentials: returns null when password wrong (user exists)', async () => {
  prisma.user.findUnique = vi.fn().mockResolvedValue({ email: 'x@x.com', passwordHash: '$2b$12$...' });
  const result = await verifyCredentials('x@x.com', 'wrongpassword');
  expect(result).toBeNull();
});
```

### 5. Timing measurement test (optional, documented only)
A manual benchmark (not a unit test) to verify the fix:
```bash
# Before fix: 
# - email not found: ~2ms
# - wrong password:  ~150ms

# After fix:
# - email not found: ~150ms
# - wrong password:  ~150ms
```

## Components Affected
| Component | Change |
|-----------|--------|
| `lib/db/userRepository.ts` | Add `DUMMY_HASH` constant; update `verifyCredentials` to always run bcrypt |
| `lib/db/userRepository.test.ts` | Add tests verifying constant-time behavior |

## Data & Database Model
No changes.

## Security Considerations
This fix eliminates the timing side-channel for user enumeration. Combined with the existing rate limiter (P015), the signin endpoint will be resistant to both brute-force (rate-limited) and enumeration (constant-time) attacks.

**Residual risks not addressed by this fix**:
- Error message differentiation: the NextAuth credentials provider currently returns the same generic error for "not found" and "wrong password" — this is correct and should not be changed.
- Application-level enumeration: the registration endpoint (`POST /api/auth/register`) returns `409 Conflict` when an email is already registered, which necessarily leaks whether the email is registered. This is a UX tradeoff (user should know they already have an account) and is documented.

## Testing Requirements
- `verifyCredentials` with unknown email: `bcrypt.compare` called with `DUMMY_HASH`.
- `verifyCredentials` with known email and wrong password: `bcrypt.compare` called with `user.passwordHash`.
- Both cases return `null`.
- `verifyCredentials` with correct credentials: returns `PublicUser` object.
- Timing test (manual): both "not found" and "wrong password" paths take ~the same duration.

## Dependency Map
- Depends on: P003 ✅ (userRepository exists), P007 ✅ (credentials provider uses verifyCredentials)
- Complements: P015 ✅ (rate limiting on signin endpoint), P040 (password reset – same constant-time requirement)
- Severity: **Medium-High** — user enumeration enables targeted phishing and credential-stuffing attacks
