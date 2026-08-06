/**
 * File: bed.adapter.ts
 * Module: beds
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IBedOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class BedAdapter implements IBedOutboundPort {
  private readonly logger = new Logger(BedAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('BedAdapter.ping — wire external integration here');
    return true;
  }
}
