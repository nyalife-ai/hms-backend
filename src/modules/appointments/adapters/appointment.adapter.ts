/**
 * File: appointment.adapter.ts
 * Module: appointments
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IAppointmentOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class AppointmentAdapter implements IAppointmentOutboundPort {
  private readonly logger = new Logger(AppointmentAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('AppointmentAdapter.ping — wire external integration here');
    return true;
  }
}
