import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("otelRegister (OTEL_EXPORTER_OTLP_ENDPOINT unset)", () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  beforeEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete globalThis.__sketchgitOtelSdk;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEndpoint !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    delete globalThis.__sketchgitOtelSdk;
  });

  it("no-ops without starting an SDK when OTEL_EXPORTER_OTLP_ENDPOINT is unset", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    // @ts-expect-error - plain JS module (loaded via --import, not tsc), no declaration file
    await import("./otelRegister.mjs");
    expect(globalThis.__sketchgitOtelSdk).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("OpenTelemetry disabled"));
    infoSpy.mockRestore();
  });
});
