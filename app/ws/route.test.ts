import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { ApiErrorCode } from "@/lib/api/errors";

describe("GET /ws", () => {
  it("returns 503 Service Unavailable", async () => {
    const res = GET();
    expect(res.status).toBe(503);
  });

  it("returns WS_UNAVAILABLE error code in body", async () => {
    const res = GET();
    const body = await res.json() as { code: string; message: string };
    expect(body.code).toBe(ApiErrorCode.WS_UNAVAILABLE);
  });

  it("includes a hint about NEXT_PUBLIC_WS_URL in the message", async () => {
    const res = GET();
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/NEXT_PUBLIC_WS_URL/);
  });
});
