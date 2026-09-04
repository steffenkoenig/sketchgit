import { describe, it, expect } from "vitest";
import { hashPassword, verifyPasswordHash, ARGON2_OPTIONS } from "./passwordHashing";
import argon2 from "argon2";

describe("passwordHashing", () => {
  describe("ARGON2_OPTIONS", () => {
    it("has the expected options for Argon2id", () => {
      expect(ARGON2_OPTIONS.type).toBe(argon2.argon2id);
      expect(ARGON2_OPTIONS.memoryCost).toBe(65536);
      expect(ARGON2_OPTIONS.timeCost).toBe(3);
      expect(ARGON2_OPTIONS.parallelism).toBe(4);
    });
  });

  describe("hashPassword", () => {
    it("produces a valid argon2 hash format", async () => {
      const password = "my-secure-password";
      const hash = await hashPassword(password);

      // Argon2 hashes typically start with $argon2id$v=19$m=...,t=...,p=...
      expect(hash.startsWith("$argon2id$")).toBe(true);
      expect(hash).toContain("$m=65536,t=3,p=4$");
    });

    it("produces unique hashes for the same password due to random salting", async () => {
      const password = "my-secure-password";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPasswordHash", () => {
    it("returns true for a matching password", async () => {
      const password = "my-secure-password";
      const hash = await hashPassword(password);

      const isValid = await verifyPasswordHash(hash, password);
      expect(isValid).toBe(true);
    });

    it("returns false for an incorrect password", async () => {
      const password = "my-secure-password";
      const hash = await hashPassword(password);

      const isValid = await verifyPasswordHash(hash, "wrong-password");
      expect(isValid).toBe(false);
    });

    it("returns false for an invalid or corrupted hash", async () => {
      const password = "my-secure-password";

      await expect(verifyPasswordHash("not-a-real-hash", password)).rejects.toThrow();
    });
  });
});
