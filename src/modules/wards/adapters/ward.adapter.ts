/**
 * File: ward.adapter.ts
 * Module: wards
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IWardOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class WardAdapter implements IWardOutboundPort {
  private readonly logger = new Logger(WardAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('WardAdapter.ping — wire external integration here');
    return true;
  }
}
