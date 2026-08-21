/**
 * Vitest global test setup.
 *
 * Runs before each test to establish a clean baseline.
 * P077 – shared test utilities for all unit and API tests.
 */
import { vi, beforeEach, afterEach } from "vitest";
import { resetFactorySequence } from "./factories";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/sketchgit";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "mock-secret-for-vitest-runs-1234567890";
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// Reset factory sequence counters before each test so IDs are predictable
// and independent between tests.
beforeEach(() => {
  resetFactorySequence();
});

// Restore all mocks after each test.
afterEach(() => {
  vi.restoreAllMocks();
});
