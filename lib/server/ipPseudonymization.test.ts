import { describe, it, expect } from "vitest";
import { pseudonymizeIp } from "./ipPseudonymization";

describe("pseudonymizeIp (GAP-017)", () => {
  it("masks the last octet of an IPv4 address", () => {
    expect(pseudonymizeIp("192.168.1.42")).toBe("192.168.1.0");
  });

  it("masks a single-digit last octet", () => {
    expect(pseudonymizeIp("10.0.0.5")).toBe("10.0.0.0");
  });

  it("masks the low 64 bits of a full IPv6 address", () => {
    expect(pseudonymizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3:8d3::");
  });

  it("leaves an already-short IPv6 address unchanged (nothing meaningful to mask)", () => {
    expect(pseudonymizeIp("::1")).toBe("::1");
  });

  it("returns unrecognized input unchanged rather than throwing", () => {
    expect(pseudonymizeIp("unknown")).toBe("unknown");
  });

  it("never returns the original full IPv4 address for a real address", () => {
    const result = pseudonymizeIp("203.0.113.99");
    expect(result).not.toBe("203.0.113.99");
    expect(result).toBe("203.0.113.0");
  });
});
