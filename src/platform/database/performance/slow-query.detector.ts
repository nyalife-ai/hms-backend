import { Injectable } from '@nestjs/common';
import type {
  QueryInformation,
  SlowQueryDetectorHook,
} from '../contracts/query-hooks.interface';

export type SlowQueryCallback = (
  information: QueryInformation,
) => void | Promise<void>;

@Injectable()
export class SlowQueryDetector implements SlowQueryDetectorHook {
  public constructor(
    public readonly thresholdMs = 1_000,
    private readonly callback: SlowQueryCallback = () => undefined,
  ) {
    if (thresholdMs < 0) {
      throw new Error('Slow query threshold must not be negative');
    }
  }

  public async inspect(information: QueryInformation): Promise<boolean> {
    if (information.durationMs < this.thresholdMs) {
      return false;
    }
    await this.onSlowQuery(information);
    return true;
  }

  public async onSlowQuery(information: QueryInformation): Promise<void> {
    await this.callback(information);
  }
}
