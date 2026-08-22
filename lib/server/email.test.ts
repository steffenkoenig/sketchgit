/**
 * Tests for lib/server/email.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { sendEmail } from "./email";

describe("sendEmail", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockSend.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns not_configured and does not call the provider when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "noreply@example.com";
    const result = await sendEmail({ to: "a@b.com", subject: "S", html: "<p>hi</p>" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns not_configured and does not call the provider when EMAIL_FROM is unset", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    const result = await sendEmail({ to: "a@b.com", subject: "S", html: "<p>hi</p>" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends via Resend with from/to/subject/html when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    mockSend.mockResolvedValue({ data: { id: "email_1" } });

    const result = await sendEmail({ to: "a@b.com", subject: "Hello", html: "<p>hi</p>" });

    expect(result).toEqual({ sent: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@example.com",
        to: "a@b.com",
        subject: "Hello",
        html: "<p>hi</p>",
      }),
    );
  });

  it("derives a plain-text fallback from the HTML when text is omitted", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    mockSend.mockResolvedValue({});

    await sendEmail({ to: "a@b.com", subject: "S", html: "<p>Hello <b>world</b></p>" });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Hello") }),
    );
    const call = mockSend.mock.calls[0][0] as { text: string };
    expect(call.text).not.toContain("<p>");
  });

  it("uses the provided text fallback verbatim when given", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    mockSend.mockResolvedValue({});

    await sendEmail({ to: "a@b.com", subject: "S", html: "<p>hi</p>", text: "custom text" });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ text: "custom text" }));
  });

  it("returns {sent:false, reason:'error'} and does not throw when the provider rejects", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@example.com";
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendEmail({ to: "a@b.com", subject: "S", html: "<p>hi</p>" });
    expect(result).toEqual({ sent: false, reason: "error" });
  });
});
