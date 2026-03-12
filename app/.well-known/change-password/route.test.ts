import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /.well-known/change-password (P072)", () => {
  it("redirects to /auth/forgot-password with 302", async () => {
    const req = new NextRequest("http://localhost/.well-known/change-password");
    const res = GET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost/auth/forgot-password"
    );
  });

  it("preserves the request host in the redirect URL", async () => {
    const req = new NextRequest(
      "https://myapp.example.com/.well-known/change-password"
    );
    const res = GET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://myapp.example.com/auth/forgot-password"
    );
  });
});
