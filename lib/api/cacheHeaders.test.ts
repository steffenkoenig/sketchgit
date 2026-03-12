import { describe, it, expect } from "vitest";
import { immutableHeaders, mutableHeaders, shortLivedHeaders } from "./cacheHeaders";

describe("immutableHeaders (P070)", () => {
  it("returns public immutable Cache-Control for one year", () => {
    const headers = immutableHeaders("abc123");
    expect(headers["Cache-Control"]).toBe(
      "public, immutable, max-age=31536000"
    );
  });

  it("includes an ETag wrapping the sha in double quotes", () => {
    const headers = immutableHeaders("abc123");
    expect(headers.ETag).toBe('"abc123"');
  });
});

describe("mutableHeaders (P070)", () => {
  it("returns private no-store Cache-Control", () => {
    const headers = mutableHeaders();
    expect(headers["Cache-Control"]).toContain("private");
    expect(headers["Cache-Control"]).toContain("no-store");
  });

  it("does not include an ETag", () => {
    const headers = mutableHeaders();
    expect(headers).not.toHaveProperty("ETag");
  });
});

describe("shortLivedHeaders (P070)", () => {
  it("returns public max-age with defaults of 3600/300", () => {
    const headers = shortLivedHeaders();
    expect(headers["Cache-Control"]).toBe(
      "public, max-age=3600, stale-while-revalidate=300"
    );
  });

  it("accepts custom max-age and swr values", () => {
    const headers = shortLivedHeaders(60, 10);
    expect(headers["Cache-Control"]).toBe(
      "public, max-age=60, stale-while-revalidate=10"
    );
  });
});
