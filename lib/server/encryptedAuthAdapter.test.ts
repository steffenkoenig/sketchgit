import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "crypto";
import { withEncryptedAccountTokens } from "./encryptedAuthAdapter";
import { encryptToken, decryptToken } from "@/lib/tokenEncryption";
import type { PrismaClient } from "@prisma/client";

describe("withEncryptedAccountTokens (GAP-014)", () => {
  beforeEach(() => {
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  function captureQueryHooks() {
    const capturedConfig: { query?: { account?: Record<string, unknown> } } = {};
    const fakeClient = {
      $extends: vi.fn((config: typeof capturedConfig) => {
        Object.assign(capturedConfig, config);
        return "extended-client";
      }),
    } as unknown as PrismaClient;

    const result = withEncryptedAccountTokens(fakeClient);
    expect(result).toBe("extended-client");
    return capturedConfig.query!.account as Record<string, (opts: unknown) => Promise<unknown>>;
  }

  it("encrypts token fields on create before calling the underlying query", async () => {
    const hooks = captureQueryHooks();
    const query = vi.fn().mockResolvedValue({ id: "acc_1" });
    const data = { provider: "github", access_token: "gho_plain", refresh_token: "ghr_plain", id_token: "idt_plain" };

    await hooks.create({ args: { data }, query });

    expect(query).toHaveBeenCalledTimes(1);
    const passedArgs = query.mock.calls[0][0] as { data: Record<string, string> };
    expect(passedArgs.data.access_token).not.toBe("gho_plain");
    expect(decryptToken(passedArgs.data.access_token)).toBe("gho_plain");
    expect(decryptToken(passedArgs.data.refresh_token)).toBe("ghr_plain");
    expect(decryptToken(passedArgs.data.id_token)).toBe("idt_plain");
  });

  it("leaves non-token fields untouched on create", async () => {
    const hooks = captureQueryHooks();
    const query = vi.fn().mockResolvedValue({});
    const data = { provider: "github", providerAccountId: "12345", access_token: "gho_plain" };

    await hooks.create({ args: { data }, query });

    const passedArgs = query.mock.calls[0][0] as { data: Record<string, string> };
    expect(passedArgs.data.provider).toBe("github");
    expect(passedArgs.data.providerAccountId).toBe("12345");
  });

  it("encrypts token fields on update", async () => {
    const hooks = captureQueryHooks();
    const query = vi.fn().mockResolvedValue({});
    const data = { access_token: "gho_updated" };

    await hooks.update({ args: { where: { id: "acc_1" }, data }, query });

    const passedArgs = query.mock.calls[0][0] as { data: Record<string, string> };
    expect(decryptToken(passedArgs.data.access_token)).toBe("gho_updated");
  });

  it("encrypts both create and update payloads on upsert", async () => {
    const hooks = captureQueryHooks();
    const query = vi.fn().mockResolvedValue({});
    const args = {
      where: { id: "acc_1" },
      create: { access_token: "gho_create" },
      update: { access_token: "gho_update" },
    };

    await hooks.upsert({ args, query });

    const passedArgs = query.mock.calls[0][0] as { create: Record<string, string>; update: Record<string, string> };
    expect(decryptToken(passedArgs.create.access_token)).toBe("gho_create");
    expect(decryptToken(passedArgs.update.access_token)).toBe("gho_update");
  });

  it("decrypts token fields on findUnique", async () => {
    const hooks = captureQueryHooks();
    const stored = { id: "acc_1", access_token: encryptToken("gho_stored") };
    const query = vi.fn().mockResolvedValue(stored);

    const result = (await hooks.findUnique({ args: {}, query })) as { access_token: string };

    expect(result.access_token).toBe("gho_stored");
  });

  it("returns null unchanged from findUnique when no account matches", async () => {
    const hooks = captureQueryHooks();
    const query = vi.fn().mockResolvedValue(null);

    const result = await hooks.findUnique({ args: {}, query });

    expect(result).toBeNull();
  });

  it("decrypts token fields on findFirst", async () => {
    const hooks = captureQueryHooks();
    const stored = { id: "acc_1", refresh_token: encryptToken("ghr_stored") };
    const query = vi.fn().mockResolvedValue(stored);

    const result = (await hooks.findFirst({ args: {}, query })) as { refresh_token: string };

    expect(result.refresh_token).toBe("ghr_stored");
  });

  it("decrypts token fields on every row from findMany", async () => {
    const hooks = captureQueryHooks();
    const stored = [
      { id: "acc_1", access_token: encryptToken("gho_a") },
      { id: "acc_2", access_token: encryptToken("gho_b") },
    ];
    const query = vi.fn().mockResolvedValue(stored);

    const results = (await hooks.findMany({ args: {}, query })) as Array<{ access_token: string }>;

    expect(results[0].access_token).toBe("gho_a");
    expect(results[1].access_token).toBe("gho_b");
  });

  it("leaves a legacy plaintext token readable rather than throwing (pre-GAP-014 rows)", async () => {
    const hooks = captureQueryHooks();
    const stored = { id: "acc_1", access_token: "gho_legacyPlaintext" };
    const query = vi.fn().mockResolvedValue(stored);

    const result = (await hooks.findUnique({ args: {}, query })) as { access_token: string };

    expect(result.access_token).toBe("gho_legacyPlaintext");
  });
});
