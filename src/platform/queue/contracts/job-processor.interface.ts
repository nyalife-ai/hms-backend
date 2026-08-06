import { Job } from './job.interface';

export interface JobProcessor<TPayload, TResult = void> {
  /**
   * Process a job. When the queue supplies an {@link AbortSignal}, honour it
   * for cooperative cancellation (timeouts / shutdown).
   */
  process(job: Job<TPayload>, signal?: AbortSignal): Promise<TResult>;
}
