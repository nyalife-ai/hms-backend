import type { JobProcessor } from '../queue/contracts/job-processor.interface';
import type { Job } from '../queue/contracts/job.interface';
import type { QueueAdapter } from '../queue/contracts/queue-adapter.interface';
import type { StorageProvider } from '../storage/storage-provider.interface';
import type { ReportDefinition, ReportQueryParams } from './report-definition';
import type {
  ReportFormat,
  ReportRecord,
  ReportRunResult,
} from './report.types';

/**
 * Renders report rows into a downloadable buffer. Implemented by a thin
 * adapter over the documents platform's generators/writers (PDF/DOCX/CSV/
 * XLSX) — this service never reimplements rendering itself.
 */
export interface ReportExportPort {
  export(
    format: ReportFormat,
    records: readonly ReportRecord[],
    definition: Pick<ReportDefinition, 'id' | 'name' | 'columns'>,
  ): Promise<Buffer>;
}

export class UnknownReportDefinitionError extends Error {
  public constructor(reportId: string) {
    super(`Report definition "${reportId}" is not registered`);
    this.name = 'UnknownReportDefinitionError';
  }
}

export interface GenerateReportOptions<
  TParams extends ReportQueryParams = ReportQueryParams,
> {
  readonly definition: ReportDefinition<TParams>;
  readonly format: ReportFormat;
  readonly params?: TParams;
}

export interface ReportJobPayload {
  readonly reportId: string;
  readonly format: ReportFormat;
  readonly params: ReportQueryParams;
  readonly storageKey: string;
}

export interface ReportGeneratorServiceOptions {
  readonly exportPort: ReportExportPort;
  readonly storage?: StorageProvider;
  readonly queue?: QueueAdapter<ReportJobPayload>;
  readonly clock?: () => Date;
}

/**
 * Orchestrates report generation by composing injected ports: fetches rows
 * from a definition's data source, renders them via {@link ReportExportPort},
 * and optionally persists the output to a {@link StorageProvider} or defers
 * generation to a {@link QueueAdapter} for scheduled/background runs.
 */
export class ReportGeneratorService {
  private readonly clock: () => Date;
  private readonly definitions = new Map<string, ReportDefinition>();

  public constructor(private readonly options: ReportGeneratorServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  /** Registers a definition so background jobs (via {@link enqueue}) can look it up by id. */
  public register(definition: ReportDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  public async generate<TParams extends ReportQueryParams = ReportQueryParams>(
    generateOptions: GenerateReportOptions<TParams>,
  ): Promise<Buffer> {
    const { definition, format, params } = generateOptions;
    const records = await definition.dataSource.fetch(
      params ?? ({} as TParams),
    );
    return this.options.exportPort.export(format, records, definition);
  }

  /** Generates and persists the output, returning a completed {@link ReportRunResult}. */
  public async generateAndStore<
    TParams extends ReportQueryParams = ReportQueryParams,
  >(
    generateOptions: GenerateReportOptions<TParams>,
    storageKey: string,
  ): Promise<ReportRunResult> {
    if (!this.options.storage) {
      throw new Error(
        'ReportGeneratorService requires a storage provider to store reports',
      );
    }
    const buffer = await this.generate(generateOptions);
    await this.options.storage.put(storageKey, buffer);
    return {
      reportId: generateOptions.definition.id,
      format: generateOptions.format,
      status: 'completed',
      storageKey,
      generatedAt: this.clock(),
    };
  }

  /** Enqueues async generation via the injected queue; call {@link createProcessor} once to actually run jobs. */
  public async enqueue<TParams extends ReportQueryParams = ReportQueryParams>(
    generateOptions: GenerateReportOptions<TParams>,
    storageKey: string,
  ): Promise<Job<ReportJobPayload>> {
    if (!this.options.queue) {
      throw new Error(
        'ReportGeneratorService requires a queue adapter to enqueue reports',
      );
    }
    this.register(generateOptions.definition);
    return this.options.queue.add({
      reportId: generateOptions.definition.id,
      format: generateOptions.format,
      params: generateOptions.params ?? {},
      storageKey,
    });
  }

  /** Adapts this service to a {@link JobProcessor} for a {@link QueueAdapter}. */
  public createProcessor(): JobProcessor<ReportJobPayload> {
    return { process: (job) => this.processJob(job) };
  }

  private async processJob(job: Job<ReportJobPayload>): Promise<void> {
    const { reportId, format, params, storageKey } = job.payload;
    const definition = this.definitions.get(reportId);
    if (!definition) {
      throw new UnknownReportDefinitionError(reportId);
    }
    await this.generateAndStore({ definition, format, params }, storageKey);
  }
}
