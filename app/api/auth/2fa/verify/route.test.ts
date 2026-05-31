import { NextRequest } from "next/server";
import { POST } from "./route";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockVerifyTwoFactorToken = vi.fn();
const mockSetTwoFactorEnabled = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

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

  it("returns 403 if code is invalid", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "usr_1", email: "test@example.com" },
    });
    mockVerifyTwoFactorToken.mockResolvedValueOnce(false);

    const req = new NextRequest("http://localhost:3000/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("sets 2FA enabled if code is valid", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "usr_1", email: "test@example.com" },
    });
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
