import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { resolveUserId } from "../../server.js";

// Mock @auth/core/jwt to simulate successful decode
vi.mock("@auth/core/jwt", () => ({
  decode: vi.fn().mockImplementation(async ({ token }) => {
    if (token === "valid-token") {
      return { sub: "user-123" };
    }
    if (token === "valid-token-no-sub") {
      return { };
    }
    throw new Error("Invalid token");
  }),
}));

describe("resolveUserId", () => {
  it("should return null if no token is present", async () => {
    const req = { headers: { cookie: "some-other-cookie=value" } } as unknown as IncomingMessage;
    const result = await resolveUserId(req);
    expect(result).toBeNull();
  });

  it("should catch errors thrown by decode and return null", async () => {
    const req = { headers: { cookie: "authjs.session-token=invalid-token" } } as unknown as IncomingMessage;
    const result = await resolveUserId(req);
    expect(result).toBeNull();
  });

  it("should return sub from valid token", async () => {
    const req = { headers: { cookie: "authjs.session-token=valid-token" } } as unknown as IncomingMessage;
    const result = await resolveUserId(req);
    expect(result).toBe("user-123");
  });

  it("should return null if valid token has no sub", async () => {
    const req = { headers: { cookie: "authjs.session-token=valid-token-no-sub" } } as unknown as IncomingMessage;
    const result = await resolveUserId(req);
    expect(result).toBeNull();
  });
});
