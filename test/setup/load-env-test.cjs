/**
 * Load isolated test env (.env.test) without touching application .env.
 * Must be required via Jest setupFiles BEFORE modules read process.env.
 *
 * Hard rules (regression brief):
 * - DATABASE_URL must be local Postgres on 127.0.0.1:5433
 * - REDIS_HOST must be local loopback (never Render / prod Redis)
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../../.env.test');
if (!fs.existsSync(envPath)) {
  throw new Error(
    `Missing ${envPath}. Create .env.test for isolated Postgres :5433 tests.`,
  );
}

const raw = fs.readFileSync(envPath, 'utf8');
for (const line of raw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // Always prefer .env.test so we cannot accidentally hit production.
  process.env[key] = value;
}

process.env.NODE_ENV = 'test';
process.env.ENABLE_DEMO_AUTH = 'false';

const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('127.0.0.1:5433') && !dbUrl.includes('localhost:5433')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must target 127.0.0.1:5433, got: ${dbUrl}`,
  );
}
if (!/\/hms_test(\?|$)/.test(dbUrl)) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must use database hms_test, got: ${dbUrl}`,
  );
}

const redisHost = (process.env.REDIS_HOST || '').trim().toLowerCase();
const localRedis = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localRedis.has(redisHost)) {
  throw new Error(
    `Refusing to run tests: REDIS_HOST must be local loopback, got: ${redisHost || '(empty)'}`,
  );
}

// Keep Bull namespaced away from any shared Redis leftovers.
if (!process.env.BULL_PREFIX) process.env.BULL_PREFIX = 'nyalife-test';
if (!process.env.BULL_PAYMENTS_QUEUE) {
  process.env.BULL_PAYMENTS_QUEUE = 'nyalife-test-payments';
}
if (!process.env.BULL_NOTIFICATIONS_QUEUE) {
  process.env.BULL_NOTIFICATIONS_QUEUE = 'nyalife-test-notifications';
}
