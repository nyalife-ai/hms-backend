import { Job } from '../contracts/job.interface';
import { JobProcessor } from '../contracts/job-processor.interface';

export abstract class BaseProcessor<TPayload, TResult> implements JobProcessor<
  TPayload,
  TResult
> {
  public async process(
    job: Job<TPayload>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    try {
      const result = await this.handle(job, signal);
      await this.onSuccess(job, result);
      return result;
    } catch (error: unknown) {
      await this.onFailure(job, error);
      throw error;
    }
  }

  protected abstract handle(
    job: Job<TPayload>,
    signal?: AbortSignal,
  ): Promise<TResult>;

  protected onSuccess(job: Job<TPayload>, result: TResult): Promise<void> {
    void job;
    void result;
    return Promise.resolve();
  }

  protected onFailure(job: Job<TPayload>, error: unknown): Promise<void> {
    void job;
    void error;
    return Promise.resolve();
  }
}
