import type { DatabaseHealthIndicator } from '../database/health/database-health.indicator';
import type { RedisClientService } from '../redis/redis-client.service';
import type { RedisHealthIndicator } from '../redis/redis.health.indicator';
import type { BrokerHealthCheckable } from './health/health-adapters';
import type { FoundationHealthSources } from './health/foundation-health.service';
import type {
  Disconnectable,
  FoundationShutdownTargets,
} from './shutdown/foundation-shutdown.registrar';

export const buildHealthSources = (
  database?: DatabaseHealthIndicator,
  redis?: RedisHealthIndicator,
  broker?: BrokerHealthCheckable,
): FoundationHealthSources => {
  const sources: {
    database?: DatabaseHealthIndicator;
    redis?: RedisHealthIndicator;
    broker?: BrokerHealthCheckable;
  } = {};
  if (database !== undefined) {
    sources.database = database;
  }
  if (redis !== undefined) {
    sources.redis = redis;
  }
  if (broker !== undefined) {
    sources.broker = broker;
  }
  return sources;
};

export const buildShutdownTargets = (
  database?: Disconnectable,
  redis?: RedisClientService,
  broker?: Disconnectable,
): FoundationShutdownTargets => {
  const targets: {
    database?: Disconnectable;
    redis?: RedisClientService;
    broker?: Disconnectable;
  } = {};
  if (database !== undefined) {
    targets.database = database;
  }
  if (redis !== undefined) {
    targets.redis = redis;
  }
  if (broker !== undefined) {
    targets.broker = broker;
  }
  return targets;
};
