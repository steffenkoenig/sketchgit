/**
 * Tests for lib/server/subscriptionTokens.ts (P094)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./subscriptionTokens";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-that-is-at-least-32-chars";
});

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trips a subscription id", () => {
    const token = signUnsubscribeToken("sub_abc123");
    expect(verifyUnsubscribeToken(token)).toBe("sub_abc123");
  });

  it("returns null for a malformed token (no dot separator)", () => {
    expect(verifyUnsubscribeToken("not-a-valid-token")).toBeNull();
  });

  it("returns null for a tampered signature", () => {
    const token = signUnsubscribeToken("sub_abc123");
    const [encoded] = token.split(".");
    expect(verifyUnsubscribeToken(`${encoded}.${"0".repeat(64)}`)).toBeNull();
  });

  it("returns null when the encoded subscription id was swapped (signature no longer matches)", () => {
    const token1 = signUnsubscribeToken("sub_abc123");
    const token2 = signUnsubscribeToken("sub_xyz789");
    const [, hmac1] = token1.split(".");
    const [encoded2] = token2.split(".");
    expect(verifyUnsubscribeToken(`${encoded2}.${hmac1}`)).toBeNull();
  });

  it("produces different tokens for different subscription ids", () => {
    expect(signUnsubscribeToken("sub_1")).not.toBe(signUnsubscribeToken("sub_2"));
  });

  it("is URL-safe (no +, /, or = characters)", () => {
    const token = signUnsubscribeToken("sub_with/special+chars=");
    expect(token).not.toMatch(/[+/=]/);
  });
});
