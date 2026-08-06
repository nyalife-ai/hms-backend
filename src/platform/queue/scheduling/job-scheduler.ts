import { JobOptions } from '../contracts/job.interface';
import { QueueAdapter } from '../contracts/queue-adapter.interface';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

export interface JobScheduleTimer {
  setTimeout(callback: () => void, milliseconds: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
  setInterval(callback: () => void, milliseconds: number): IntervalHandle;
  clearInterval(handle: IntervalHandle): void;
}

export interface ScheduledJobHandle {
  cancel(): void;
}

const defaultTimer: JobScheduleTimer = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle),
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (handle) => clearInterval(handle),
};

export class JobScheduler<TPayload> {
  public constructor(
    private readonly queue: QueueAdapter<TPayload>,
    private readonly timer: JobScheduleTimer = defaultTimer,
  ) {}

  public scheduleDelayed(
    payload: TPayload,
    delayMs: number,
    options: JobOptions = {},
  ): ScheduledJobHandle {
    this.validateDelay(delayMs);
    let cancelled = false;
    const timerHandle = this.timer.setTimeout(() => {
      if (!cancelled) {
        void this.queue.add(payload, options);
      }
    }, delayMs);
    return {
      cancel: (): void => {
        cancelled = true;
        this.timer.clearTimeout(timerHandle);
      },
    };
  }

  public scheduleRepeated(
    payload: TPayload,
    intervalMs: number,
    options: JobOptions = {},
    maxRuns?: number,
  ): ScheduledJobHandle {
    this.validateDelay(intervalMs);
    if (maxRuns !== undefined && (!Number.isInteger(maxRuns) || maxRuns < 1)) {
      throw new RangeError('maxRuns must be a positive integer');
    }
    let runs = 0;
    const timerHandle = this.timer.setInterval(() => {
      runs += 1;
      void this.queue.add(payload, options);
      if (maxRuns !== undefined && runs >= maxRuns) {
        this.timer.clearInterval(timerHandle);
      }
    }, intervalMs);
    return {
      cancel: (): void => this.timer.clearInterval(timerHandle),
    };
  }

  private validateDelay(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      throw new RangeError('Schedule delay must be a positive finite number');
    }
  }
}
