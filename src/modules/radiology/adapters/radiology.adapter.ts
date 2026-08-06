/**
 * File: radiology.adapter.ts
 * Module: radiology
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IRadiologyOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class RadiologyAdapter implements IRadiologyOutboundPort {
  private readonly logger = new Logger(RadiologyAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('RadiologyAdapter.ping — wire external integration here');
    return true;
  }
}
