import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlingService {
  public calculateDelay(
    requestCount: number,
    burstLimit: number,
    baseDelayMs = 50,
    maxDelayMs = 5_000,
  ): number {
    if (requestCount <= burstLimit) return 0;
    const exponent = Math.min(10, requestCount - burstLimit - 1);
    return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  }
}
