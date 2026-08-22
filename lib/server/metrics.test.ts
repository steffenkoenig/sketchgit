import { describe, it, expect } from "vitest";
import {
  wsConnectionGauge,
  wsMessageCounter,
  cacheHitCounter,
  cacheMissCounter,
  saveCommitHistogram,
} from "./metrics";

describe("metrics", () => {
  it("registers all instruments without error using the no-op meter provider (OTEL disabled)", () => {
    expect(wsConnectionGauge).toBeDefined();
    expect(wsMessageCounter).toBeDefined();
    expect(cacheHitCounter).toBeDefined();
    expect(cacheMissCounter).toBeDefined();
    expect(saveCommitHistogram).toBeDefined();
  });

  it("accepts recordings without throwing", () => {
    expect(() => wsMessageCounter.add(1, { type: "commit" })).not.toThrow();
    expect(() => cacheHitCounter.add(1)).not.toThrow();
    expect(() => cacheMissCounter.add(1)).not.toThrow();
    expect(() => saveCommitHistogram.record(12.5, { storage: "snapshot" })).not.toThrow();
    expect(() => wsConnectionGauge.addCallback(() => {})).not.toThrow();
  });
});
