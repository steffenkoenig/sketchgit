import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

const mockVerifyTwoFactorToken = vi.fn();
const mockSetTwoFactorEnabled = vi.fn();

vi.mock("@/lib/db/userRepository", () => ({
  verifyTwoFactorToken: (...args: any[]) => mockVerifyTwoFactorToken(...args),
  setTwoFactorEnabled: (...args: any[]) => mockSetTwoFactorEnabled(...args),
}));

describe("POST /api/auth/2fa/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthorized", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: "test@example.com", id: "usr_1" } });
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: "invalid-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 if validation fails", async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: "test@example.com", id: "usr_1" } });
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "12" }), // too short
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 403 if code is invalid or expired", async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: "test@example.com", id: "usr_1" } });
    mockVerifyTwoFactorToken.mockResolvedValueOnce(false);
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockVerifyTwoFactorToken).toHaveBeenCalledWith("test@example.com", "123456");
  });

  it("sets 2FA enabled if code is valid", async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: "test@example.com", id: "usr_1" } });
    mockVerifyTwoFactorToken.mockResolvedValueOnce(true);
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSetTwoFactorEnabled).toHaveBeenCalledWith("usr_1", true);
  });
});
