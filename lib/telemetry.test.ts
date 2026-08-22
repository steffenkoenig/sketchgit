import { describe, it, expect, afterEach } from "vitest";
import { shutdownTelemetry } from "./telemetry";

describe("shutdownTelemetry", () => {
  afterEach(() => {
    delete globalThis.__sketchgitOtelSdk;
  });

  it("resolves without error when no SDK was ever started (OTEL disabled)", async () => {
    delete globalThis.__sketchgitOtelSdk;
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  it("calls shutdown() on the registered SDK instance", async () => {
    const shutdown = async () => {};
    let called = false;
    globalThis.__sketchgitOtelSdk = {
      shutdown: async () => { called = true; await shutdown(); },
    } as unknown as typeof globalThis.__sketchgitOtelSdk;

    await shutdownTelemetry();
    expect(called).toBe(true);
  });
});
