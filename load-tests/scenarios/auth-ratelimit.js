/**
 * P083 – Load test: verify the auth rate limiter (P015/P046) actually
 * kicks in under a request flood, rather than silently failing open.
 *
 * Targets /api/auth/forgot-password (rate-limited per BUG-016) with a
 * fixed, non-existent email — the endpoint always returns 200 to avoid
 * user enumeration, so this only proves the *rate limiter* behavior, not
 * whether a specific account exists.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from '../k6.config.js';

// Asserts the limiter actually engaged at least once during the run — a
// check that only verifies "200 or 429" per request would still pass if
// rate limiting were silently broken and every request returned 200.
const rateLimited = new Counter('rate_limited_responses');

export const options = {
  vus: 20,
  duration: '1m',
  thresholds: {
    rate_limited_responses: ['count>0'],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/auth/forgot-password`,
    JSON.stringify({ email: 'load-test-nonexistent@example.com' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  if (res.status === 429) {
    rateLimited.add(1);
    check(res, {
      '429 uses structured error body': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.code === 'RATE_LIMITED';
        } catch {
          return false;
        }
      },
    });
  }

  sleep(0.1);
}
