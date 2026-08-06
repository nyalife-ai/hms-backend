/**
 * File: consultation.adapter.ts
 * Module: consultations
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IConsultationOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class ConsultationAdapter implements IConsultationOutboundPort {
  private readonly logger = new Logger(ConsultationAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('ConsultationAdapter.ping — wire external integration here');
    return true;
  }
}
