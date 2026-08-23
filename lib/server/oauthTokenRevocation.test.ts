import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { revokeGitHubToken } from "./oauthTokenRevocation";

describe("revokeGitHubToken (GAP-014)", () => {
  const originalId = process.env.GITHUB_ID;
  const originalSecret = process.env.GITHUB_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GITHUB_ID = "test-client-id";
    process.env.GITHUB_SECRET = "test-client-secret";
  });

  afterEach(() => {
    if (originalId === undefined) delete process.env.GITHUB_ID;
    else process.env.GITHUB_ID = originalId;
    if (originalSecret === undefined) delete process.env.GITHUB_SECRET;
    else process.env.GITHUB_SECRET = originalSecret;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls GitHub's revoke endpoint with Basic auth and the access token in the body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = mockFetch as unknown as typeof fetch;

    await revokeGitHubToken("gho_theToken");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/applications/test-client-id/token");
    expect(init.method).toBe("DELETE");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({ access_token: "gho_theToken" });
  });

  it("no-ops without making a request when GitHub OAuth is not configured", async () => {
    delete process.env.GITHUB_ID;
    delete process.env.GITHUB_SECRET;
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await revokeGitHubToken("gho_theToken");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("never throws when the network request fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    await expect(revokeGitHubToken("gho_theToken")).resolves.toBeUndefined();
  });

  it("never throws on an unexpected non-2xx, non-404 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(revokeGitHubToken("gho_theToken")).resolves.toBeUndefined();
  });

  it("treats a 404 (already invalid/unknown to GitHub) as a normal outcome, not a failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(revokeGitHubToken("gho_theToken")).resolves.toBeUndefined();
  });
});
