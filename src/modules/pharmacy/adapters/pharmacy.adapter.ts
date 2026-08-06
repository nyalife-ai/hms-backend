/**
 * File: pharmacy.adapter.ts
 * Module: pharmacy
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IPharmacyOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class PharmacyAdapter implements IPharmacyOutboundPort {
  private readonly logger = new Logger(PharmacyAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('PharmacyAdapter.ping — wire external integration here');
    return true;
  }
}
