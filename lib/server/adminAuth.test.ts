import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyAdminSecret } from "./adminAuth";
import { timingSafeEqual } from "node:crypto";

vi.mock("node:crypto", () => {
  return {
    timingSafeEqual: vi.fn((a, b) => {
      // Just do standard comparison in tests unless we throw
      return a.equals(b);
    }),
  };
});

describe("verifyAdminSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns false if ADMIN_API_SECRET is unset", () => {
    vi.stubEnv("ADMIN_API_SECRET", "");
    expect(verifyAdminSecret("my-secret")).toBe(false);

    vi.unstubAllEnvs();
    expect(verifyAdminSecret("my-secret")).toBe(false);
  });

  it("returns false if provided is null", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    expect(verifyAdminSecret(null)).toBe(false);
  });

  it("returns false if provided is empty string", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    expect(verifyAdminSecret("")).toBe(false);
  });

  it("returns false if provided length doesn't match expected length", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    expect(verifyAdminSecret("short")).toBe(false);
    expect(verifyAdminSecret("supersecret-extra")).toBe(false);
  });

  it("returns false if provided matches length but not content", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    expect(verifyAdminSecret("SUPERsecret")).toBe(false);
    expect(verifyAdminSecret("supersecred")).toBe(false);
  });

  it("returns true if provided exactly matches ADMIN_API_SECRET", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    expect(verifyAdminSecret("supersecret")).toBe(true);
  });

  it("returns false if timingSafeEqual throws an error", () => {
    vi.stubEnv("ADMIN_API_SECRET", "supersecret");
    vi.mocked(timingSafeEqual).mockImplementationOnce(() => {
      throw new Error("Mocked error");
    });
    expect(verifyAdminSecret("supersecret")).toBe(false);
  });
});
