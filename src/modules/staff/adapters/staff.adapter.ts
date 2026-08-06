/**
 * File: staff.adapter.ts
 * Module: staff
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IStaffOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class StaffAdapter implements IStaffOutboundPort {
  private readonly logger = new Logger(StaffAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('StaffAdapter.ping — wire external integration here');
    return true;
  }
}
