import { describe, it, expect } from "vitest";
import { getSafeCallbackUrl } from "./redirects";

describe("getSafeCallbackUrl", () => {
  const baseUrl = "http://localhost:3000";

  it("should return the path for a valid relative path", () => {
    expect(getSafeCallbackUrl("/api/invitations/123", baseUrl)).toBe("/api/invitations/123");
    expect(getSafeCallbackUrl("/api/share/abc?roomId=1", baseUrl)).toBe("/api/share/abc?roomId=1");
  });

  it("should prevent open redirect via scheme-relative URLs", () => {
    expect(getSafeCallbackUrl("//evil.com", baseUrl)).toBe("/");
    expect(getSafeCallbackUrl("/\\evil.com", baseUrl)).toBe("/");
    // /\tevil.com parses to /evil.com, which is valid local path, so it should be allowed!
    expect(getSafeCallbackUrl("/\tevil.com", baseUrl)).toBe("/evil.com");
  });

  it("should prevent open redirect via absolute URLs", () => {
    expect(getSafeCallbackUrl("https://evil.com", baseUrl)).toBe("/");
    expect(getSafeCallbackUrl("http://evil.com", baseUrl)).toBe("/");
  });

  it("should prevent javascript injection", () => {
    expect(getSafeCallbackUrl("javascript:alert(1)", baseUrl)).toBe("/");
  });
});
