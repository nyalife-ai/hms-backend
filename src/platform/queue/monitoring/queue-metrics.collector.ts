import { Injectable } from '@nestjs/common';
import { QueueMetrics, QueueMetricsTracker } from './queue-metrics.interface';

@Injectable()
export class QueueMetricsCollector implements QueueMetricsTracker {
  private processed = 0;
  private failed = 0;
  private totalDurationMs = 0;
  private depth = 0;
  private retries = 0;

  public recordProcessed(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('durationMs must be a non-negative finite number');
    }
    this.processed += 1;
    this.totalDurationMs += durationMs;
  }

  public recordFailed(): void {
    this.failed += 1;
  }

  public recordRetry(): void {
    this.retries += 1;
  }

  public setDepth(depth: number): void {
    if (!Number.isInteger(depth) || depth < 0) {
      throw new RangeError('depth must be a non-negative integer');
    }
    this.depth = depth;
  }

  public snapshot(): QueueMetrics {
    return Object.freeze({
      processed: this.processed,
      failed: this.failed,
      avgDurationMs:
        this.processed === 0 ? 0 : this.totalDurationMs / this.processed,
      depth: this.depth,
      retries: this.retries,
    });
  }
}
