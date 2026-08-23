import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { encryptToken, decryptToken, isEncryptedToken, decryptTokenSafe } from "./tokenEncryption";

describe("tokenEncryption (GAP-014)", () => {
  const originalKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  const originalAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = originalKey;
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  describe("round-trip with an explicit key", () => {
    it("decrypts to the original plaintext", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const token = "gho_realGitHubAccessTokenValue1234567890";
      const encrypted = encryptToken(token);
      expect(decryptToken(encrypted)).toBe(token);
    });

    it("produces different ciphertext for the same plaintext each time (random IV)", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const token = "gho_sameToken";
      expect(encryptToken(token)).not.toBe(encryptToken(token));
    });

    it("produces a colon-delimited iv:ciphertext:authTag format", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const encrypted = encryptToken("gho_x");
      expect(encrypted.split(":")).toHaveLength(3);
    });
  });

  describe("round-trip with the AUTH_SECRET-derived fallback key", () => {
    it("decrypts to the original plaintext when OAUTH_TOKEN_ENCRYPTION_KEY is unset", () => {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      process.env.AUTH_SECRET = "a-test-auth-secret-that-is-long-enough-32";
      const token = "gho_fallbackKeyToken";
      const encrypted = encryptToken(token);
      expect(decryptToken(encrypted)).toBe(token);
    });

    it("a different AUTH_SECRET cannot decrypt tokens encrypted under another", () => {
      delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
      process.env.AUTH_SECRET = "first-secret-padded-to-32-characters-abc";
      const encrypted = encryptToken("gho_x");

      process.env.AUTH_SECRET = "second-secret-padded-to-32-characters-xyz";
      expect(() => decryptToken(encrypted)).toThrow();
    });
  });

  describe("isEncryptedToken", () => {
    it("recognises the encrypted format", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      expect(isEncryptedToken(encryptToken("gho_x"))).toBe(true);
    });

    it("rejects a legacy plaintext GitHub token", () => {
      expect(isEncryptedToken("gho_1234567890abcdef")).toBe(false);
    });

    it("rejects a malformed value with the right shape but non-base64 segments", () => {
      expect(isEncryptedToken("not:base64!:value")).toBe(false);
    });
  });

  describe("decryptTokenSafe", () => {
    it("decrypts a genuinely encrypted value", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const token = "gho_x";
      expect(decryptTokenSafe(encryptToken(token))).toBe(token);
    });

    it("returns a legacy plaintext token unchanged instead of throwing", () => {
      expect(decryptTokenSafe("gho_legacyPlaintextToken")).toBe("gho_legacyPlaintextToken");
    });

    it("returns null/undefined unchanged", () => {
      expect(decryptTokenSafe(null)).toBeNull();
      expect(decryptTokenSafe(undefined)).toBeUndefined();
    });

    it("returns the ciphertext unchanged (not throw) when the key can no longer decrypt it", () => {
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const encrypted = encryptToken("gho_x");
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
      expect(decryptTokenSafe(encrypted)).toBe(encrypted);
    });
  });
});
