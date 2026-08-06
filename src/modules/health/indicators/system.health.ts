import { Injectable } from '@nestjs/common';
import {
  IHealthIndicator,
  HealthIndicatorResult,
} from '../interfaces/health-check.interface';
import * as os from 'node:os';

@Injectable()
export class SystemHealthIndicator implements IHealthIndicator {
  public readonly name = 'system';

  public check(): Promise<HealthIndicatorResult> {
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;

    if (usagePercent > 95) {
      return Promise.resolve({
        status: 'down',
        message: `Memory usage critical: ${usagePercent.toFixed(2)}%`,
      });
    }

    return Promise.resolve({
      status: 'up',
      latency: 0,
      message: `Memory usage: ${usagePercent.toFixed(2)}%`,
    });
  }
}
