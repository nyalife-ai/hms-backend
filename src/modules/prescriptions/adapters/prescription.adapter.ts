/**
 * File: prescription.adapter.ts
 * Module: prescriptions
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IPrescriptionOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class PrescriptionAdapter implements IPrescriptionOutboundPort {
  private readonly logger = new Logger(PrescriptionAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('PrescriptionAdapter.ping — wire external integration here');
    return true;
  }
}
