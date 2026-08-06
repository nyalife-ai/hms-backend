import type { QueueAdapter } from '../../queue/contracts/queue-adapter.interface';
import type { StorageProvider } from '../../storage/storage-provider.interface';
import type { ScheduledTask } from '../../scheduling/contracts';
import { AggregationService } from '../aggregation.service';
import { DashboardDataService } from '../dashboard-data.service';
import { defineReport, type ReportDefinition } from '../report-definition';
import {
  ReportGeneratorService,
  UnknownReportDefinitionError,
  type ReportExportPort,
  type ReportJobPayload,
} from '../report-generator.service';
import { ReportSchedulerService } from '../report-scheduler.service';
import type { ReportRecord } from '../report.types';
import {
  REPORT_EXPORT_PORT,
  REPORT_QUEUE_ADAPTER,
  REPORT_SCHEDULER,
  REPORT_STORAGE_PROVIDER,
} from '../reporting.tokens';

describe('reporting platform / report-definition', () => {
  it('returns the definition unchanged when the id is valid', () => {
    const definition: ReportDefinition = {
      id: 'sales-summary',
      name: 'Sales Summary',
      dataSource: { fetch: () => [] },
    };
    expect(defineReport(definition)).toBe(definition);
  });

  it('throws when the id is empty or blank', () => {
    expect(() =>
      defineReport({ id: '', name: 'x', dataSource: { fetch: () => [] } }),
    ).toThrow(TypeError);
    expect(() =>
      defineReport({ id: '   ', name: 'x', dataSource: { fetch: () => [] } }),
    ).toThrow(TypeError);
  });
});

describe('reporting platform / report-generator.service', () => {
  const records: readonly ReportRecord[] = [
    { region: 'east', total: 10 },
    { region: 'west', total: 20 },
  ];

  function makeExportPort(): jest.Mocked<ReportExportPort> {
    return { export: jest.fn().mockResolvedValue(Buffer.from('rendered')) };
  }

  function makeStorage(): jest.Mocked<StorageProvider> {
    return {
      name: 'fake',
      put: jest.fn().mockResolvedValue({ key: 'k', size: 0 }),
      get: jest.fn(),
      getStream: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      signedUrl: jest.fn(),
    };
  }

  function makeQueue(): jest.Mocked<QueueAdapter<ReportJobPayload>> {
    return {
      add: jest.fn().mockResolvedValue({
        id: 'q-1',
        payload: {
          reportId: 'sales',
          format: 'pdf',
          params: {},
          storageKey: 'reports/sales.pdf',
        },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
      remove: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getStatus: jest.fn(),
      process: jest.fn(),
    };
  }

  function makeDefinition(
    fetch: () =>
      Promise<readonly ReportRecord[]> | readonly ReportRecord[] = () =>
      records,
  ): ReportDefinition {
    return { id: 'sales', name: 'Sales', dataSource: { fetch } };
  }

  it('generates a buffer by fetching rows and delegating to the export port', async () => {
    const exportPort = makeExportPort();
    const service = new ReportGeneratorService({ exportPort });
    const definition = makeDefinition();
    const buffer = await service.generate({ definition, format: 'pdf' });
    expect(buffer.toString()).toBe('rendered');
    expect(exportPort.export).toHaveBeenCalledWith('pdf', records, definition);
  });

  it('passes provided params through to the data source', async () => {
    const exportPort = makeExportPort();
    const fetch = jest.fn().mockReturnValue(records);
    const service = new ReportGeneratorService({ exportPort });
    const definition = makeDefinition(fetch);
    await service.generate({
      definition,
      format: 'csv',
      params: { year: 2026 },
    });
    expect(fetch).toHaveBeenCalledWith({ year: 2026 });
  });

  it('defaults params to an empty object when omitted', async () => {
    const exportPort = makeExportPort();
    const fetch = jest.fn().mockReturnValue(records);
    const service = new ReportGeneratorService({ exportPort });
    const definition = makeDefinition(fetch);
    await service.generate({ definition, format: 'csv' });
    expect(fetch).toHaveBeenCalledWith({});
  });

  it('uses an injected clock for generatedAt', async () => {
    const exportPort = makeExportPort();
    const storage = makeStorage();
    const fixed = new Date('2026-03-01T00:00:00Z');
    const service = new ReportGeneratorService({
      exportPort,
      storage,
      clock: () => fixed,
    });
    const result = await service.generateAndStore(
      { definition: makeDefinition(), format: 'pdf' },
      'reports/sales.pdf',
    );
    expect(result.generatedAt).toBe(fixed);
  });

  it('throws when generateAndStore is called without a storage provider', async () => {
    const service = new ReportGeneratorService({
      exportPort: makeExportPort(),
    });
    await expect(
      service.generateAndStore(
        { definition: makeDefinition(), format: 'pdf' },
        'reports/sales.pdf',
      ),
    ).rejects.toThrow('requires a storage provider');
  });

  it('generates and persists the report, returning a completed run result', async () => {
    const exportPort = makeExportPort();
    const storage = makeStorage();
    const service = new ReportGeneratorService({ exportPort, storage });
    const definition = makeDefinition();
    const result = await service.generateAndStore(
      { definition, format: 'xlsx' },
      'reports/sales.xlsx',
    );
    expect(storage.put).toHaveBeenCalledWith(
      'reports/sales.xlsx',
      expect.any(Buffer),
    );
    expect(result).toMatchObject({
      reportId: 'sales',
      format: 'xlsx',
      status: 'completed',
      storageKey: 'reports/sales.xlsx',
    });
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('throws when enqueue is called without a queue adapter', async () => {
    const service = new ReportGeneratorService({
      exportPort: makeExportPort(),
    });
    await expect(
      service.enqueue(
        { definition: makeDefinition(), format: 'pdf' },
        'reports/sales.pdf',
      ),
    ).rejects.toThrow('requires a queue adapter');
  });

  it('registers the definition and enqueues a job with default params', async () => {
    const exportPort = makeExportPort();
    const queue = makeQueue();
    const service = new ReportGeneratorService({ exportPort, queue });
    const definition = makeDefinition();
    const job = await service.enqueue(
      { definition, format: 'pdf' },
      'reports/sales.pdf',
    );
    expect(queue.add).toHaveBeenCalledWith({
      reportId: 'sales',
      format: 'pdf',
      params: {},
      storageKey: 'reports/sales.pdf',
    });
    expect(job.id).toBe('q-1');
  });

  it('enqueues a job carrying the supplied params', async () => {
    const exportPort = makeExportPort();
    const queue = makeQueue();
    const service = new ReportGeneratorService({ exportPort, queue });
    const definition = makeDefinition();
    await service.enqueue(
      { definition, format: 'csv', params: { region: 'east' } },
      'reports/sales.csv',
    );
    expect(queue.add).toHaveBeenCalledWith({
      reportId: 'sales',
      format: 'csv',
      params: { region: 'east' },
      storageKey: 'reports/sales.csv',
    });
  });

  it('throws UnknownReportDefinitionError when processing an unregistered report', async () => {
    const exportPort = makeExportPort();
    const storage = makeStorage();
    const service = new ReportGeneratorService({ exportPort, storage });
    const processor = service.createProcessor();
    await expect(
      processor.process({
        id: 'q-1',
        payload: {
          reportId: 'missing',
          format: 'pdf',
          params: {},
          storageKey: 'reports/missing.pdf',
        },
        createdAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 1,
        metadata: {},
      }),
    ).rejects.toThrow(UnknownReportDefinitionError);
  });

  it('processes a registered report job end-to-end via the queue processor', async () => {
    const exportPort = makeExportPort();
    const storage = makeStorage();
    const queue = makeQueue();
    const service = new ReportGeneratorService({ exportPort, storage, queue });
    const definition = makeDefinition();
    const job = await service.enqueue(
      { definition, format: 'pdf', params: { region: 'east' } },
      'reports/sales.pdf',
    );
    const processor = service.createProcessor();
    await processor.process({
      id: job.id,
      payload: {
        reportId: 'sales',
        format: 'pdf',
        params: { region: 'east' },
        storageKey: 'reports/sales.pdf',
      },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });
    expect(storage.put).toHaveBeenCalledWith(
      'reports/sales.pdf',
      expect.any(Buffer),
    );
  });

  it('allows explicit registration independent of enqueue', async () => {
    const exportPort = makeExportPort();
    const storage = makeStorage();
    const service = new ReportGeneratorService({ exportPort, storage });
    const definition = makeDefinition();
    service.register(definition);
    const processor = service.createProcessor();
    await processor.process({
      id: 'q-1',
      payload: {
        reportId: 'sales',
        format: 'csv',
        params: {},
        storageKey: 'reports/sales.csv',
      },
      createdAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
      metadata: {},
    });
    expect(storage.put).toHaveBeenCalled();
  });
});

describe('reporting platform / report-scheduler.service', () => {
  function makeExportPort(): jest.Mocked<ReportExportPort> {
    return { export: jest.fn().mockResolvedValue(Buffer.from('rendered')) };
  }

  function makeStorage(): jest.Mocked<StorageProvider> {
    return {
      name: 'fake',
      put: jest.fn().mockResolvedValue({ key: 'k', size: 0 }),
      get: jest.fn(),
      getStream: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      signedUrl: jest.fn(),
    };
  }

  function makeDefinition(): ReportDefinition {
    return {
      id: 'weekly-sales',
      name: 'Weekly Sales',
      dataSource: { fetch: () => [{ total: 1 }] },
    };
  }

  it('registers a task with the scheduler carrying all schedule fields', () => {
    const registered: ScheduledTask[] = [];
    const scheduler = {
      register: (task: ScheduledTask) => registered.push(task),
    };
    const generator = new ReportGeneratorService({
      exportPort: makeExportPort(),
      storage: makeStorage(),
    });
    const reportScheduler = new ReportSchedulerService(scheduler, generator);
    const runAt = new Date('2026-04-01T00:00:00Z');
    reportScheduler.schedule({
      id: 'weekly-sales-job',
      type: 'cron',
      cron: '0 0 * * 1',
      intervalMs: undefined,
      runAt,
      enabled: true,
      generate: { definition: makeDefinition(), format: 'pdf' },
      storageKey: 'reports/weekly-sales.pdf',
    });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      id: 'weekly-sales-job',
      type: 'cron',
      cron: '0 0 * * 1',
      runAt,
      enabled: true,
    });
    expect(typeof registered[0].handler).toBe('function');
  });

  it('generates and stores the report and invokes onGenerated when the task fires', async () => {
    const registered: ScheduledTask[] = [];
    const scheduler = {
      register: (task: ScheduledTask) => registered.push(task),
    };
    const storage = makeStorage();
    const generator = new ReportGeneratorService({
      exportPort: makeExportPort(),
      storage,
    });
    const reportScheduler = new ReportSchedulerService(scheduler, generator);
    const onGenerated = jest.fn().mockResolvedValue(undefined);
    reportScheduler.schedule({
      id: 'weekly-sales-job',
      type: 'interval',
      intervalMs: 60_000,
      generate: { definition: makeDefinition(), format: 'csv' },
      storageKey: 'reports/weekly-sales.csv',
      onGenerated,
    });
    await registered[0].handler();
    expect(storage.put).toHaveBeenCalledWith(
      'reports/weekly-sales.csv',
      expect.any(Buffer),
    );
    expect(onGenerated).toHaveBeenCalledWith('reports/weekly-sales.csv');
  });

  it('runs the handler without an onGenerated callback', async () => {
    const registered: ScheduledTask[] = [];
    const scheduler = {
      register: (task: ScheduledTask) => registered.push(task),
    };
    const storage = makeStorage();
    const generator = new ReportGeneratorService({
      exportPort: makeExportPort(),
      storage,
    });
    const reportScheduler = new ReportSchedulerService(scheduler, generator);
    reportScheduler.schedule({
      id: 'weekly-sales-job',
      type: 'once',
      runAt: new Date(),
      generate: { definition: makeDefinition(), format: 'pdf' },
      storageKey: 'reports/weekly-sales.pdf',
    });
    await expect(registered[0].handler()).resolves.toBeUndefined();
  });
});

describe('reporting platform / aggregation.service', () => {
  const records: readonly ReportRecord[] = [
    { region: 'east', channel: 'web', total: 10 },
    { region: 'east', channel: 'store', total: 30 },
    { region: 'west', channel: 'web', total: 20 },
  ];

  it('groups records by a single key', () => {
    const service = new AggregationService();
    const groups = service.groupBy(records, ['region']);
    expect([...groups.keys()]).toHaveLength(2);
    expect(groups.get(JSON.stringify(['east']))).toHaveLength(2);
  });

  it('groups records by multiple keys and treats a missing field as null', () => {
    const service = new AggregationService();
    const groups = service.groupBy(
      [...records, { region: 'east' }],
      ['region', 'channel'],
    );
    expect(groups.size).toBe(4);
  });

  it('sums a numeric field, coercing numeric-looking strings and treating non-numeric as 0', () => {
    const service = new AggregationService();
    expect(service.sum(records, 'total')).toBe(60);
    expect(
      service.sum([{ total: '5' }, { total: 'not-a-number' }], 'total'),
    ).toBe(5);
  });

  it('counts records regardless of field', () => {
    const service = new AggregationService();
    expect(service.count(records)).toBe(3);
    expect(service.count([])).toBe(0);
  });

  it('averages a field and returns 0 for an empty array', () => {
    const service = new AggregationService();
    expect(service.avg(records, 'total')).toBe(20);
    expect(service.avg([], 'total')).toBe(0);
  });

  it('computes min and max, returning 0 for an empty array', () => {
    const service = new AggregationService();
    expect(service.min(records, 'total')).toBe(10);
    expect(service.max(records, 'total')).toBe(30);
    expect(service.min([], 'total')).toBe(0);
    expect(service.max([], 'total')).toBe(0);
  });

  it('aggregates with grouping and every metric operation', () => {
    const service = new AggregationService();
    const results = service.aggregate(records, {
      groupBy: ['region'],
      metrics: [
        { operation: 'sum', field: 'total', as: 'total' },
        { operation: 'count', as: 'count' },
        { operation: 'avg', field: 'total', as: 'avg' },
        { operation: 'min', field: 'total', as: 'min' },
        { operation: 'max', field: 'total', as: 'max' },
      ],
    });
    const east = results.find((result) => result.group['region'] === 'east');
    expect(east?.metrics).toEqual({
      total: 40,
      count: 2,
      avg: 20,
      min: 10,
      max: 30,
    });
  });

  it('aggregates without grouping into a single overall bucket', () => {
    const service = new AggregationService();
    const results = service.aggregate(records, {
      metrics: [{ operation: 'sum', field: 'total', as: 'total' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].group).toEqual({});
    expect(results[0].metrics).toEqual({ total: 60 });
  });

  it('throws when a non-count metric is missing its field', () => {
    const service = new AggregationService();
    expect(() =>
      service.aggregate(records, {
        metrics: [{ operation: 'sum', as: 'total' } as never],
      }),
    ).toThrow('requires a field');
  });

  it('throws for an unknown aggregation operation', () => {
    const service = new AggregationService();
    expect(() =>
      service.aggregate(records, {
        metrics: [{ operation: 'median' as never, field: 'total', as: 'x' }],
      }),
    ).toThrow('Unknown aggregation operation');
  });

  it('returns an empty metrics object for an empty group when aggregating over no records', () => {
    const service = new AggregationService();
    const results = service.aggregate([], {
      groupBy: ['region'],
      metrics: [{ operation: 'count', as: 'count' }],
    });
    expect(results).toEqual([]);
  });
});

describe('reporting platform / dashboard-data.service', () => {
  const records: readonly ReportRecord[] = [
    { region: 'east', total: 10 },
    { region: 'east', total: 30 },
    { region: 'west', total: 20 },
  ];

  it('constructs its own AggregationService when none is injected', () => {
    const service = new DashboardDataService();
    const series = service.buildSeries(records, {
      name: 'Revenue',
      labelField: 'region',
      valueField: 'total',
    });
    expect(series.name).toBe('Revenue');
    expect(series.points).toEqual(
      expect.arrayContaining([
        { label: 'east', value: 40 },
        { label: 'west', value: 20 },
      ]),
    );
  });

  it('builds a series using a custom operation', () => {
    const service = new DashboardDataService(new AggregationService());
    const series = service.buildSeries(records, {
      name: 'Order count',
      labelField: 'region',
      operation: 'count',
    });
    expect(series.points).toEqual(
      expect.arrayContaining([
        { label: 'east', value: 2 },
        { label: 'west', value: 1 },
      ]),
    );
  });

  it('falls back to an empty string label when the group field is missing', () => {
    const service = new DashboardDataService();
    const series = service.buildSeries([{ total: 5 }], {
      name: 'Revenue',
      labelField: 'region',
      valueField: 'total',
    });
    expect(series.points).toEqual([{ label: '', value: 5 }]);
  });

  it('stringifies non-string group labels (number, boolean, Date, object)', () => {
    const service = new DashboardDataService();
    expect(
      service.buildSeries([{ region: 2026, total: 1 }], {
        name: 'Revenue',
        labelField: 'region',
        valueField: 'total',
      }).points,
    ).toEqual([{ label: '2026', value: 1 }]);
    expect(
      service.buildSeries([{ region: true, total: 1 }], {
        name: 'Revenue',
        labelField: 'region',
        valueField: 'total',
      }).points,
    ).toEqual([{ label: 'true', value: 1 }]);
    const date = new Date('2026-01-01T00:00:00Z');
    expect(
      service.buildSeries([{ region: date, total: 1 }], {
        name: 'Revenue',
        labelField: 'region',
        valueField: 'total',
      }).points,
    ).toEqual([{ label: date.toISOString(), value: 1 }]);
    expect(
      service.buildSeries([{ region: { code: 'e' }, total: 1 }], {
        name: 'Revenue',
        labelField: 'region',
        valueField: 'total',
      }).points,
    ).toEqual([{ label: JSON.stringify({ code: 'e' }), value: 1 }]);
  });

  it('throws building a sum series without a valueField', () => {
    const service = new DashboardDataService();
    expect(() =>
      service.buildSeries(records, { name: 'Revenue', labelField: 'region' }),
    ).toThrow('requires a field');
  });

  it('builds a count KPI by default', () => {
    const service = new DashboardDataService();
    const kpi = service.buildKpi(records, { name: 'Orders' });
    expect(kpi).toEqual({ name: 'Orders', value: 3 });
  });

  it('builds a sum/avg/min/max KPI given a field', () => {
    const service = new DashboardDataService();
    expect(
      service.buildKpi(records, {
        name: 'Total',
        field: 'total',
        operation: 'sum',
      }).value,
    ).toBe(60);
    expect(
      service.buildKpi(records, {
        name: 'Avg',
        field: 'total',
        operation: 'avg',
      }).value,
    ).toBe(20);
    expect(
      service.buildKpi(records, {
        name: 'Min',
        field: 'total',
        operation: 'min',
      }).value,
    ).toBe(10);
    expect(
      service.buildKpi(records, {
        name: 'Max',
        field: 'total',
        operation: 'max',
      }).value,
    ).toBe(30);
  });

  it('throws building a non-count KPI without a field', () => {
    const service = new DashboardDataService();
    expect(() =>
      service.buildKpi(records, { name: 'Total', operation: 'sum' }),
    ).toThrow('requires a field');
  });

  it('throws for an unknown KPI operation', () => {
    const service = new DashboardDataService();
    expect(() =>
      service.buildKpi(records, {
        name: 'Weird',
        field: 'total',
        operation: 'median' as never,
      }),
    ).toThrow('Unknown KPI operation');
  });

  it('reports previousValue and a positive changePercent', () => {
    const service = new DashboardDataService();
    const kpi = service.buildKpi(records, {
      name: 'Total',
      field: 'total',
      operation: 'sum',
      previousRecords: [{ total: 30 }],
    });
    expect(kpi.previousValue).toBe(30);
    expect(kpi.changePercent).toBe(100);
  });

  it('reports a negative changePercent when usage drops', () => {
    const service = new DashboardDataService();
    const kpi = service.buildKpi([{ total: 10 }], {
      name: 'Total',
      field: 'total',
      operation: 'sum',
      previousRecords: [{ total: 20 }],
    });
    expect(kpi.changePercent).toBe(-50);
  });

  it('reports 0% change when both current and previous values are zero', () => {
    const service = new DashboardDataService();
    const kpi = service.buildKpi([], {
      name: 'Total',
      operation: 'count',
      previousRecords: [],
    });
    expect(kpi.value).toBe(0);
    expect(kpi.previousValue).toBe(0);
    expect(kpi.changePercent).toBe(0);
  });

  it('reports 100% change when previous value is zero but current is not', () => {
    const service = new DashboardDataService();
    const kpi = service.buildKpi(records, {
      name: 'Orders',
      operation: 'count',
      previousRecords: [],
    });
    expect(kpi.previousValue).toBe(0);
    expect(kpi.changePercent).toBe(100);
  });
});

describe('reporting platform / reporting.tokens', () => {
  it('exposes distinct DI tokens', () => {
    expect(typeof REPORT_EXPORT_PORT).toBe('symbol');
    expect(typeof REPORT_STORAGE_PROVIDER).toBe('symbol');
    expect(typeof REPORT_QUEUE_ADAPTER).toBe('symbol');
    expect(typeof REPORT_SCHEDULER).toBe('symbol');
  });
});
