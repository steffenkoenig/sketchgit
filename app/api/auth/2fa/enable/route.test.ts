import { NextRequest } from "next/server";
import { POST } from "./route";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockSetTwoFactorEnabled = vi.fn();
const mockCreateTwoFactorToken = vi.fn();
const mockResend = vi.fn();
const mockAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db/userRepository", () => ({
  setTwoFactorEnabled: (...args: any[]) => mockSetTwoFactorEnabled(...args),
  createTwoFactorToken: (...args: any[]) => mockCreateTwoFactorToken(...args),
}));

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = {
        send: mockResend,
      };
    },
  };
});

describe("POST /api/auth/2fa/enable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthorized", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ enable: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("disables 2FA if enable is false", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "usr_1", email: "test@example.com" },
    });
    const req = new NextRequest("http://localhost:3000/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ enable: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSetTwoFactorEnabled).toHaveBeenCalledWith("usr_1", false);
  });

  it("creates token and sends email if enable is true", async () => {
    process.env.RESEND_API_KEY = "mock_key";
    process.env.EMAIL_FROM = "test@example.com";
    mockAuth.mockResolvedValueOnce({
      user: { id: "usr_1", email: "test@example.com" },
    });
    mockCreateTwoFactorToken.mockResolvedValueOnce("123456");

    const req = new NextRequest("http://localhost:3000/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ enable: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCreateTwoFactorToken).toHaveBeenCalledWith("test@example.com");
    expect(mockResend).toHaveBeenCalled();
  });
});
