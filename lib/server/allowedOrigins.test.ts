import { describe, it, expect } from 'vitest';
import { parseAllowedOrigins } from './allowedOrigins';

describe('parseAllowedOrigins', () => {
  it('should parse valid comma-separated origins', () => {
    const raw = "http://localhost:3000, https://staging.example.com";
    const origins = parseAllowedOrigins(raw, "fallback");
    expect(origins.size).toBe(2);
    expect(origins.has("http://localhost:3000")).toBe(true);
    expect(origins.has("https://staging.example.com")).toBe(true);
  });

  it('should fallback to defaultOrigin if raw is undefined', () => {
    const origins = parseAllowedOrigins(undefined, "http://default.com");
    expect(origins.size).toBe(1);
    expect(origins.has("http://default.com")).toBe(true);
  });

  it('should fallback to defaultOrigin if raw is empty', () => {
    const origins = parseAllowedOrigins("   ", "http://default.com");
    expect(origins.size).toBe(1);
    expect(origins.has("http://default.com")).toBe(true);
  });

  it('should fallback to trimmed raw string if URL parsing fails', () => {
    // This is the error path we are specifically tasked to test.
    const raw = "invalid-url-format, http://localhost:3000";
    const origins = parseAllowedOrigins(raw, "fallback");
    expect(origins.size).toBe(2);
    expect(origins.has("invalid-url-format")).toBe(true);
    expect(origins.has("http://localhost:3000")).toBe(true);
  });

  it('should ignore empty items after splitting', () => {
    const raw = "http://localhost:3000, , https://staging.example.com";
    const origins = parseAllowedOrigins(raw, "fallback");
    expect(origins.size).toBe(2);
    expect(origins.has("http://localhost:3000")).toBe(true);
    expect(origins.has("https://staging.example.com")).toBe(true);
  });
});
