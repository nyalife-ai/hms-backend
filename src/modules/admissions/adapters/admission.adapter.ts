/**
 * File: admission.adapter.ts
 * Module: admissions
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IAdmissionOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class AdmissionAdapter implements IAdmissionOutboundPort {
  private readonly logger = new Logger(AdmissionAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('AdmissionAdapter.ping — wire external integration here');
    return true;
  }
}
