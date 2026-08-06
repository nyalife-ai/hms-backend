/**
 * File: medication.adapter.ts
 * Module: medications
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IMedicationOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class MedicationAdapter implements IMedicationOutboundPort {
  private readonly logger = new Logger(MedicationAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('MedicationAdapter.ping — wire external integration here');
    return true;
  }
}
