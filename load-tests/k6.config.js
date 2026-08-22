/**
 * P083 – Shared k6 configuration.
 *
 * BASE_URL / WS_URL point at the target deployment. Override via k6's -e flag:
 *   k6 run -e BASE_URL=http://localhost:3000 load-tests/smoke.js
 */
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const WS_URL = __ENV.WS_URL || BASE_URL.replace(/^http/, 'ws') + '/ws';

/** A room id/slug that must already exist with seeded commits — see load-tests/seed.mjs. */
export const SEED_ROOM_ID = __ENV.SEED_ROOM_ID || 'load-test-room';
