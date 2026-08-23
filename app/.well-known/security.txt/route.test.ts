import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /.well-known/security.txt (GAP-011)", () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;

  afterEach(() => {
    if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalNextAuthUrl;
  });

  it("returns 200 with a plain-text content type", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });

  it("derives Canonical and Policy from NEXTAUTH_URL, not a hardcoded domain", async () => {
    process.env.NEXTAUTH_URL = "https://myapp.example.com";
    const res = GET();
    const body = await res.text();
    expect(body).toContain("Canonical: https://myapp.example.com/.well-known/security.txt");
    expect(body).toContain("Policy: https://myapp.example.com/security-policy");
  });

  it("falls back to localhost when NEXTAUTH_URL is unset", async () => {
    delete process.env.NEXTAUTH_URL;
    const res = GET();
    const body = await res.text();
    expect(body).toContain("Canonical: http://localhost:3000/.well-known/security.txt");
  });

  it("includes a real, non-placeholder contact address", async () => {
    const res = GET();
    const body = await res.text();
    expect(body).toContain("Contact: mailto:sketchgit-security@skonig.de");
    expect(body).not.toContain("example.com");
  });

  it("sets an Expires date roughly one year in the future, never in the past", async () => {
    const res = GET();
    const body = await res.text();
    const match = body.match(/^Expires: (.+)$/m);
    expect(match).not.toBeNull();
    const expires = new Date(match![1]).getTime();
    const now = Date.now();
    expect(expires).toBeGreaterThan(now + 300 * 24 * 60 * 60 * 1000);
    expect(expires).toBeLessThan(now + 400 * 24 * 60 * 60 * 1000);
  });
});
