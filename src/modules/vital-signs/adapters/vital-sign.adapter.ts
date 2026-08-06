/**
 * File: vital-sign.adapter.ts
 * Module: vital-signs
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IVitalSignOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class VitalSignAdapter implements IVitalSignOutboundPort {
  private readonly logger = new Logger(VitalSignAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('VitalSignAdapter.ping — wire external integration here');
    return true;
  }
}
