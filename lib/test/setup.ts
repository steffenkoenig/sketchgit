/**
 * Vitest global test setup.
 *
 * Runs before each test to establish a clean baseline.
 * P077 – shared test utilities for all unit and API tests.
 */
import { vi, beforeEach, afterEach } from "vitest";
import { resetFactorySequence } from "./factories";

// Reset factory sequence counters before each test so IDs are predictable
// and independent between tests.
beforeEach(() => {
  resetFactorySequence();
});

// Restore all mocks after each test.
afterEach(() => {
  vi.restoreAllMocks();
});
