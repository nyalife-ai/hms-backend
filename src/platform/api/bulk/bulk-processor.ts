export interface BulkFailure {
  readonly index: number;
  readonly error: string;
}

export interface BulkResult {
  readonly succeeded: number;
  readonly failed: readonly BulkFailure[];
}

export interface BulkProcessorOptions<T> {
  readonly batchSize?: number;
  readonly validate: (
    item: T,
    index: number,
  ) => boolean | string | Promise<boolean | string>;
  readonly onBatch?: (
    items: readonly T[],
    indexes: readonly number[],
  ) => void | Promise<void>;
}

export class BulkProcessor<T> {
  private readonly batchSize: number;

  public constructor(private readonly options: BulkProcessorOptions<T>) {
    this.batchSize = options.batchSize ?? 100;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
      throw new RangeError('Batch size must be a positive integer');
    }
  }

  public async process(items: readonly T[]): Promise<BulkResult> {
    const failed: BulkFailure[] = [];
    let succeeded = 0;
    for (let start = 0; start < items.length; start += this.batchSize) {
      const batch = items.slice(start, start + this.batchSize);
      const valid: T[] = [];
      const indexes: number[] = [];
      const outcomes = await Promise.all(
        batch.map(async (item, offset) => {
          const index = start + offset;
          try {
            const result = await this.options.validate(item, index);
            if (result !== true) {
              return {
                item,
                index,
                error:
                  typeof result === 'string' ? result : 'Validation failed',
              };
            }
            return { item, index };
          } catch (error: unknown) {
            return { item, index, error: this.errorMessage(error) };
          }
        }),
      );
      for (const outcome of outcomes) {
        if (outcome.error !== undefined) {
          failed.push({ index: outcome.index, error: outcome.error });
        } else {
          valid.push(outcome.item);
          indexes.push(outcome.index);
        }
      }
      if (valid.length === 0) continue;
      try {
        await this.options.onBatch?.(valid, indexes);
        succeeded += valid.length;
      } catch (error: unknown) {
        const message = this.errorMessage(error);
        failed.push(...indexes.map((index) => ({ index, error: message })));
      }
    }
    return {
      succeeded,
      failed: failed.sort((left, right) => left.index - right.index),
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
