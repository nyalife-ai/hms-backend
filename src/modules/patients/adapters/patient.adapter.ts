/**
 * File: patient.adapter.ts
 * Module: patients
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IPatientOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class PatientAdapter implements IPatientOutboundPort {
  private readonly logger = new Logger(PatientAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('PatientAdapter.ping — wire external integration here');
    return true;
  }
}
