/**
 * E2E bootstrap env — allow app boot when remote DB/Redis are unreachable.
 * Set E2E_USE_LIVE_DB=true to exercise a real database (.env loaded via dotenv).
 */
const path = require('path');
try {
  require('dotenv').config({
    path: path.join(__dirname, '..', '.env'),
  });
} catch {
  // dotenv optional if already injected by the shell
}

process.env.DATABASE_OPTIONAL = 'true';
process.env.REDIS_OPTIONAL = 'true';
process.env.STORAGE_PROVIDER =
  process.env.E2E_USE_LIVE_DB === 'true'
    ? process.env.STORAGE_PROVIDER || 'memory'
    : 'memory';
process.env.REALTIME_ENABLED = process.env.REALTIME_ENABLED || 'false';
delete process.env.METRICS_TOKEN;

if (process.env.E2E_USE_LIVE_DB !== 'true') {
  process.env.DATABASE_URL =
    'postgresql://invalid:invalid@127.0.0.1:1/postgres?connect_timeout=1&connection_limit=1&pool_timeout=1';
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}
