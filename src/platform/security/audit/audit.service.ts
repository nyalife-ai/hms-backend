import { Injectable } from '@nestjs/common';
import { assertPositiveInteger } from '../../architecture/production-defaults';
import type { AuditSink } from './audit-sink.interface';
import type { AuditEvent } from './audit.types';

@Injectable()
export class AuditService {
  public constructor(private readonly sink: AuditSink) {}

  public record(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
    return this.sink.write({ ...event, timestamp: new Date() });
  }
}

export interface InMemoryAuditSinkOptions {
  /** Maximum retained audit events. Defaults to 10_000. */
  readonly maxEntries?: number;
}

@Injectable()
export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];
  private readonly maxEntries: number;

  public constructor(options: InMemoryAuditSinkOptions = {}) {
    this.maxEntries = assertPositiveInteger(
      options.maxEntries ?? 10_000,
      'InMemoryAuditSink maxEntries',
    );
  }

  public write(event: AuditEvent): Promise<void> {
    if (this.events.length >= this.maxEntries) {
      return Promise.reject(
        new RangeError(
          `InMemoryAuditSink is full (maxEntries=${this.maxEntries})`,
        ),
      );
    }
    this.events.push(event);
    return Promise.resolve();
  }

  public all(): readonly AuditEvent[] {
    return [...this.events];
  }
}
