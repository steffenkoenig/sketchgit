/**
 * P083 – Load test: GET /api/rooms/[roomId]/commits (paginated commit history).
 *
 * Requires a seeded room with commit history — run load-tests/seed.mjs first.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, SEED_ROOM_ID } from '../k6.config.js';

export const options = {
  vus: 50,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/rooms/${SEED_ROOM_ID}/commits?take=50`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has commits array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.commits);
      } catch {
        return false;
      }
    },
  });
  sleep(1);
}
