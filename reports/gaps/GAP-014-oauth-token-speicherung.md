# GAP-014 – OAuth-Token-Speicherung (OAuth Token Storage Security)

**Status:** ❌ Open  
**Priority:** 🟡 Medium  
**Category:** DSGVO Art. 32 / IT Security  
**Effort Estimate:** 8–16 hours  

---

## 1. Description

OAuth access and refresh tokens issued by GitHub are stored in the `Account` table in plaintext (as returned by NextAuth's Prisma adapter). If the PostgreSQL database is accessed by an attacker, these tokens can be used immediately to access users' GitHub accounts without the users' knowledge. This violates the principle of appropriate security (DSGVO Art. 32) and creates a high-risk breach scenario (Art. 34).

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 32 Abs. 1 lit. a | Pseudonymisation and encryption of personal data |
| DSGVO 2016/679 | Art. 32 Abs. 1 lit. b | Ongoing confidentiality of processing systems |
| DSGVO 2016/679 | Art. 34 Abs. 3 lit. a | Exception to subject notification if data was encrypted |
| BSI TR-02102 | – | BSI Technical Guideline on cryptographic methods |

---

## 3. Current State

The NextAuth Prisma adapter stores the following token fields in the `Account` table:

| Field | Type | Content | Sensitivity |
|---|---|---|---|
| `access_token` | String? | GitHub OAuth access token | 🔴 High – grants API access to user's GitHub account |
| `refresh_token` | String? | GitHub OAuth refresh token | 🔴 High – allows generating new access tokens |
| `id_token` | String? | OIDC ID token (JWT) | 🟡 Medium – contains user identity claims |

**Token Risk:**
- GitHub access tokens grant access to the user's GitHub profile, email, and (depending on OAuth scopes) repository access.
- If the database is breached, an attacker can immediately use these tokens without needing the user's password.
- The tokens remain valid until they expire (GitHub access tokens: 8 hours; refresh tokens: 6 months).

---

## 4. What Needs to Be Done

### 4.1 Encrypt OAuth Tokens at Rest (Recommended)

Implement **application-level envelope encryption** for token fields using AES-256-GCM:

**Key design:**
1. A master encryption key (`OAUTH_TOKEN_ENCRYPTION_KEY`) is stored as an environment variable (32 bytes, base64-encoded).
2. When storing a token, generate a random 12-byte IV, encrypt with AES-256-GCM, and store as `iv:ciphertext:authtag` (base64).
3. When reading a token, detect the encrypted format and decrypt before returning.

**Implementation location:** `lib/server/tokenEncryption.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.OAUTH_TOKEN_ENCRYPTION_KEY!, 'base64');

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(':');
}

export function decryptToken(ciphertext: string): string {
  const [ivB64, encB64, tagB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export function isEncryptedToken(value: string): boolean {
  return value.split(':').length === 3;
}
```

**Integration with NextAuth:**
- Override the Prisma adapter's `createSession`, `getAccount`, and related methods to encrypt on write and decrypt on read.
- Alternatively, use a Prisma middleware/extension to transparently encrypt/decrypt the `access_token`, `refresh_token`, and `id_token` fields.

### 4.2 Database-Level Encryption (Alternative / Complementary)

As an alternative or complement to application-level encryption:
- Enable **pgcrypto** extension in PostgreSQL and use `pgp_sym_encrypt/pgp_sym_decrypt`.
- Or use transparent disk encryption at the PostgreSQL server level (e.g., LUKS on Linux, encrypted volume at cloud provider).

**Comparison:**

| Approach | Protection Against | Complexity |
|---|---|---|
| Application-level encryption | Compromised DB dump, DB admin access | Medium |
| Database column encryption (pgcrypto) | Compromised DB dump | Medium |
| Full-disk encryption | Physical disk theft | Low (provider-managed) |

**Recommendation:** Use full-disk encryption (provider-managed) as a baseline, plus application-level encryption for the highest-risk token fields.

### 4.3 Minimal Scope – Reduce OAuth Scopes Requested

Review the GitHub OAuth scopes configured in `lib/auth.ts`:

- Request only the minimum scopes needed (e.g., `read:user` and `user:email`).
- Do **not** request repository access (`repo`) unless the application specifically needs it.
- Reduced scopes mean that even if tokens are leaked, the attacker's access is limited.

### 4.4 Token Revocation on Account Deletion

When a user deletes their account (`DELETE /api/auth/account`), the current flow nullifies the user record. However, the OAuth tokens should ideally be explicitly revoked with the provider before deletion:

GitHub token revocation API:
```
DELETE https://api.github.com/applications/{client_id}/token
Authorization: Basic {base64(GITHUB_ID:GITHUB_SECRET)}
Body: { "access_token": "..." }
```

This ensures GitHub tokens are invalid immediately, not just "orphaned" in the database.

### 4.5 Add `OAUTH_TOKEN_ENCRYPTION_KEY` to Environment Variables

Add to `lib/env.ts`:

```typescript
OAUTH_TOKEN_ENCRYPTION_KEY: z.string().min(44).optional(),
// 32 bytes base64-encoded = 44 chars; optional since GitHub OAuth is optional
```

Add to `.env.example`:
```
# Optional: 32-byte base64-encoded key for encrypting OAuth tokens at rest
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# OAUTH_TOKEN_ENCRYPTION_KEY=
```

---

## 5. Risk Assessment

| Scenario | Without Encryption | With Encryption |
|---|---|---|
| Database dump exposed | OAuth tokens immediately usable | Tokens encrypted; attacker needs encryption key too |
| Database admin with SELECT access | Can read all tokens | Cannot read tokens without encryption key |
| DSGVO Art. 34 – subject notification | Always required on breach | May be waived if encryption key was not compromised |

---

## 6. Priority Guidance

This gap is **Medium priority** because:
- It requires active database compromise (not just network access).
- Password hashes are already encrypted (Argon2id).
- GitHub tokens expire (access token: 8 hours, refresh token: 6 months).

However, implement before production launch if GitHub OAuth is enabled for users.

---

## 7. Verification

1. `Account` table in PostgreSQL: `access_token` column contains `iv:ciphertext:tag` format, not raw token strings.
2. GitHub API call using a token read directly from the database returns 401 (token encrypted, unusable as-is).
3. After account deletion, GitHub API confirms token is revoked.
4. `OAUTH_TOKEN_ENCRYPTION_KEY` is documented in `.env.example`.
