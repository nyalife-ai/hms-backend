import type { ScheduledTask, ScheduleType } from '../scheduling/contracts';
import type { ReportQueryParams } from './report-definition';
import type {
  GenerateReportOptions,
  ReportGeneratorService,
} from './report-generator.service';

/**
 * Minimal structural port satisfied by the platform's `SchedulerService`
 * (`src/platform/scheduling`) — any compatible scheduler or test double
 * works, so this slice never depends on a concrete scheduler implementation.
 */
export interface ReportSchedulerPort {
  register(task: ScheduledTask): void;
}

export interface ScheduleReportOptions<
  TParams extends ReportQueryParams = ReportQueryParams,
> {
  readonly id: string;
  readonly type: ScheduleType;
  readonly cron?: string;
  readonly intervalMs?: number;
  readonly runAt?: Date;
  readonly enabled?: boolean;
  readonly generate: GenerateReportOptions<TParams>;
  readonly storageKey: string;
  /** Invoked with the report's storage key after a successful scheduled run. */
  readonly onGenerated?: (storageKey: string) => void | Promise<void>;
}

/**
 * Bridges scheduled report generation to an injected {@link ReportSchedulerPort}
 * (or a bare cron/interval callback wrapper), so scheduling policy stays in
 * `src/platform/scheduling` and this slice only supplies the task handler.
 */
export class ReportSchedulerService {
  public constructor(
    private readonly scheduler: ReportSchedulerPort,
    private readonly generator: ReportGeneratorService,
  ) {}

  public schedule<TParams extends ReportQueryParams = ReportQueryParams>(
    options: ScheduleReportOptions<TParams>,
  ): void {
    this.scheduler.register({
      id: options.id,
      type: options.type,
      cron: options.cron,
      intervalMs: options.intervalMs,
      runAt: options.runAt,
      enabled: options.enabled,
      handler: async () => {
        await this.generator.generateAndStore(
          options.generate,
          options.storageKey,
        );
        await options.onGenerated?.(options.storageKey);
      },
    });
  }
}
