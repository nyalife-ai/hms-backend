import {
  ApplicationEvent,
  createApplicationEventId,
  IntegrationEvent,
  createIntegrationEventId,
  DomainEvent,
  createDomainEventId,
} from '../index';
import type { EventHandler } from '../event-handler';
import type { CoreEvent } from '../core-event';

class SampleDomainEvent extends DomainEvent {
  public constructor(aggregateId: string) {
    super({
      eventId: createDomainEventId(),
      aggregateId,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      eventVersion: 1,
      eventName: 'sample.domain',
    });
  }
}

class SampleIntegrationEvent extends IntegrationEvent {
  public constructor(payload: Record<string, unknown>) {
    super({
      eventId: createIntegrationEventId(),
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      eventVersion: 1,
      eventName: 'sample.integration',
      source: 'api',
      correlationId: 'corr-1',
      payload,
    });
  }
}

class SampleApplicationEvent extends ApplicationEvent {
  public constructor(data?: Record<string, unknown>) {
    super({
      eventId: createApplicationEventId(),
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      eventName: 'sample.application',
      correlationId: 'corr-2',
      data,
    });
  }
}

class CountingHandler implements EventHandler<SampleApplicationEvent> {
  public readonly eventType = 'sample.application';
  public calls = 0;

  public async handle(_event: SampleApplicationEvent): Promise<void> {
    this.calls += 1;
  }
}

describe('Event id generators', () => {
  it('creates unique integration and application ids', () => {
    expect(createIntegrationEventId()).not.toBe(createIntegrationEventId());
    expect(createApplicationEventId()).not.toBe(createApplicationEventId());
  });
});

describe('IntegrationEvent / ApplicationEvent', () => {
  it('freezes integration payload', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const event = new SampleIntegrationEvent({ resourceId: 'r1' });
    expect(event.payload).toEqual({ resourceId: 'r1' });
    expect(event.source).toBe('api');
    expect(event.correlationId).toBe('corr-1');
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(event.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const read = event.occurredAt;
    read.setUTCFullYear(1999);
    expect(event.occurredAt.getTime()).toBe(at.getTime());
  });

  it('supports application events with and without data', () => {
    const withData = new SampleApplicationEvent({ step: 1 });
    const withoutData = new SampleApplicationEvent();
    expect(withData.data).toEqual({ step: 1 });
    expect(Object.isFrozen(withData.data)).toBe(true);
    expect(withoutData.data).toBeUndefined();
    expect(withData.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const read = withData.occurredAt;
    read.setUTCFullYear(1999);
    expect(withData.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('EventHandler + CoreEvent union', () => {
  it('handles application events', async () => {
    const handler = new CountingHandler();
    await handler.handle(new SampleApplicationEvent());
    expect(handler.calls).toBe(1);
  });

  it('allows CoreEvent union assignment', () => {
    const events: CoreEvent[] = [
      new SampleDomainEvent('a1'),
      new SampleIntegrationEvent({ ok: true }),
      new SampleApplicationEvent({ ok: true }),
    ];
    expect(events).toHaveLength(3);
  });
});
