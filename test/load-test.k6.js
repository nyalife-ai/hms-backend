/**
 * k6 Load Testing Script — generic API scaffold.
 *
 * Run:
 *   k6 run test/load-test.k6.js
 *   BASE_URL=https://staging.example.com AUTH_TOKEN=<jwt> k6 run test/load-test.k6.js
 *
 * Install: https://k6.io/docs/getting-started/installation/
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const authLatency = new Trend('auth_response_time');
const healthLatency = new Trend('health_response_time');
const protectedLatency = new Trend('protected_response_time');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
    health_response_time: ['p(95)<100'],
    auth_response_time: ['p(95)<500'],
    protected_response_time: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const testCredentials = {
  email: __ENV.LOAD_TEST_EMAIL || 'admin@example.com',
  password: __ENV.LOAD_TEST_PASSWORD || 'AdminPass123!',
};

export default function () {
  group('health', () => {
    const res = http.get(`${BASE_URL}/public/health`);
    healthLatency.add(res.timings.duration);
    const ok = check(res, {
      'health status is 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  group('auth', () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify(testCredentials),
      { headers: { 'Content-Type': 'application/json' } },
    );
    authLatency.add(res.timings.duration);
    // Accept 200/201 (success) or 401 (misconfigured credentials in env) —
    // the goal is latency under load, not seeding a database here.
    const ok = check(res, {
      'auth responds': (r) => [200, 201, 401].includes(r.status),
    });
    errorRate.add(!ok && res.status >= 500);
  });

  group('protected', () => {
    if (!AUTH_TOKEN) {
      sleep(0.5);
      return;
    }
    const res = http.get(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    protectedLatency.add(res.timings.duration);
    const ok = check(res, {
      'protected route responds': (r) => [200, 401, 403].includes(r.status),
    });
    errorRate.add(!ok && res.status >= 500);
  });

  sleep(1);
}
