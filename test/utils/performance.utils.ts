/**
 * Performance / load-testing utilities.
 *
 * Use these helpers to measure response-time distributions in Nest e2e
 * contexts. For production-grade load tests prefer k6 (`test/load-test.k6.js`)
 * or Artillery against a deployed environment.
 */

import { INestApplication } from '@nestjs/common';

export interface PerformanceMetrics {
  endpoint: string;
  method: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  responseTimes: {
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
  };
  requestsPerSecond: number;
  errors: string[];
}

export interface LoadTestConfig {
  baseUrl: string;
  duration: string;
  vus: number;
  rampUp: string;
  endpoints: LoadTestEndpoint[];
}

export interface LoadTestEndpoint {
  path: string;
  method: string;
  weight?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

export function calculateMetrics(
  endpoint: string,
  method: string,
  responseTimes: number[],
  errors: string[],
  durationSeconds: number,
): PerformanceMetrics {
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const total = responseTimes.length;
  const failed = errors.length;

  return {
    endpoint,
    method,
    totalRequests: total,
    successfulRequests: Math.max(total - failed, 0),
    failedRequests: failed,
    responseTimes: {
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      avg:
        sorted.length > 0
          ? sorted.reduce((a, b) => a + b, 0) / sorted.length
          : 0,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    },
    requestsPerSecond: durationSeconds > 0 ? total / durationSeconds : 0,
    errors,
  };
}

/**
 * Lightweight in-process load simulation for CI smoke checks.
 * Does not issue real HTTP — use k6 for accurate network load.
 */
export async function runSimpleLoadTest(
  _app: INestApplication,
  config: LoadTestConfig,
): Promise<PerformanceMetrics[]> {
  const metrics: PerformanceMetrics[] = [];
  const baseUrl = config.baseUrl || 'http://localhost:3000';

  console.log(`\nStarting load simulation against ${baseUrl}`);
  console.log(`Duration: ${config.duration}, VUs: ${config.vus}\n`);

  for (const endpoint of config.endpoints) {
    const responseTimes: number[] = [];
    const errors: string[] = [];
    const requests = config.vus * 10;

    console.log(`Testing ${endpoint.method} ${endpoint.path}...`);
    const startTime = Date.now();

    for (let i = 0; i < requests; i++) {
      try {
        const requestStart = Date.now();
        await simulateRequest(endpoint);
        responseTimes.push(Date.now() - requestStart);
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    const endpointMetrics = calculateMetrics(
      endpoint.path,
      endpoint.method,
      responseTimes,
      errors,
      duration,
    );
    metrics.push(endpointMetrics);

    console.log(`  Completed ${requests} requests in ${duration.toFixed(2)}s`);
    console.log(
      `  Avg: ${endpointMetrics.responseTimes.avg.toFixed(2)}ms | P95: ${endpointMetrics.responseTimes.p95.toFixed(2)}ms | RPS: ${endpointMetrics.requestsPerSecond.toFixed(2)}\n`,
    );
  }

  return metrics;
}

async function simulateRequest(endpoint: LoadTestEndpoint): Promise<void> {
  void endpoint;
  const delay = Math.random() * 100 + 10;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export const PERFORMANCE_THRESHOLDS = {
  health: {
    maxResponseTime: 100,
    minRequestsPerSecond: 100,
    maxErrorRate: 0.01,
  },
  auth: {
    maxResponseTime: 500,
    minRequestsPerSecond: 50,
    maxErrorRate: 0.01,
  },
  transactions: {
    maxResponseTime: 1000,
    minRequestsPerSecond: 20,
    maxErrorRate: 0.001,
  },
  webhooks: {
    maxResponseTime: 200,
    minRequestsPerSecond: 100,
    maxErrorRate: 0.001,
  },
};

export function checkThresholds(
  metrics: PerformanceMetrics[],
  thresholds: typeof PERFORMANCE_THRESHOLDS = PERFORMANCE_THRESHOLDS,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const metric of metrics) {
    const threshold = getThresholdForEndpoint(metric.endpoint, thresholds);
    if (!threshold) continue;

    if (metric.responseTimes.avg > threshold.maxResponseTime) {
      failures.push(
        `${metric.endpoint}: Avg response time ${metric.responseTimes.avg.toFixed(2)}ms exceeds ${threshold.maxResponseTime}ms`,
      );
    }

    if (metric.requestsPerSecond < threshold.minRequestsPerSecond) {
      failures.push(
        `${metric.endpoint}: RPS ${metric.requestsPerSecond.toFixed(2)} below ${threshold.minRequestsPerSecond}`,
      );
    }

    const errorRate =
      metric.totalRequests > 0
        ? metric.failedRequests / metric.totalRequests
        : 0;
    if (errorRate > threshold.maxErrorRate) {
      failures.push(
        `${metric.endpoint}: Error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(threshold.maxErrorRate * 100).toFixed(2)}%`,
      );
    }
  }

  return { passed: failures.length === 0, failures };
}

function getThresholdForEndpoint(
  endpoint: string,
  thresholds: typeof PERFORMANCE_THRESHOLDS,
): (typeof PERFORMANCE_THRESHOLDS)[keyof typeof PERFORMANCE_THRESHOLDS] {
  if (endpoint.includes('health') || endpoint.includes('metrics')) {
    return thresholds.health;
  }
  if (endpoint.includes('auth') || endpoint.includes('login')) {
    return thresholds.auth;
  }
  if (endpoint.includes('webhook')) {
    return thresholds.webhooks;
  }
  if (
    endpoint.includes('transaction') ||
    endpoint.includes('resource') ||
    endpoint.includes('order')
  ) {
    return thresholds.transactions;
  }
  return thresholds.health;
}

export function generatePerformanceReport(
  metrics: PerformanceMetrics[],
): string {
  let report = '\nPerformance Test Report\n';
  report += '='.repeat(60) + '\n\n';

  for (const metric of metrics) {
    report += `Endpoint: ${metric.method} ${metric.endpoint}\n`;
    report += '-'.repeat(40) + '\n';
    report += `  Total Requests:     ${metric.totalRequests}\n`;
    report += `  Successful:         ${metric.successfulRequests}\n`;
    report += `  Failed:             ${metric.failedRequests}\n`;
    report += `  Requests/sec:       ${metric.requestsPerSecond.toFixed(2)}\n`;
    report += `  Response Times:\n`;
    report += `    Min:              ${metric.responseTimes.min.toFixed(2)}ms\n`;
    report += `    Max:              ${metric.responseTimes.max.toFixed(2)}ms\n`;
    report += `    Avg:              ${metric.responseTimes.avg.toFixed(2)}ms\n`;
    report += `    Median:           ${metric.responseTimes.median.toFixed(2)}ms\n`;
    report += `    P95:              ${metric.responseTimes.p95.toFixed(2)}ms\n`;
    report += `    P99:              ${metric.responseTimes.p99.toFixed(2)}ms\n`;

    if (metric.errors.length > 0) {
      report += `  Errors:\n`;
      metric.errors.slice(0, 5).forEach((err) => {
        report += `    - ${err}\n`;
      });
      if (metric.errors.length > 5) {
        report += `    ... and ${metric.errors.length - 5} more\n`;
      }
    }
    report += '\n';
  }

  return report;
}
