/**
 * P083 – Smoke test: fast, low-VU sanity check safe to run in the main CI
 * job (5 VUs, 30s) to catch catastrophic regressions before the full
 * load-test suite runs post-merge.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './k6.config.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health status is 200': (r) => r.status === 200,
    'health reports ok': (r) => JSON.parse(r.body).status === 'ok',
  });

  const ready = http.get(`${BASE_URL}/api/ready`);
  check(ready, { 'ready status is 200': (r) => r.status === 200 });

  sleep(1);
}
