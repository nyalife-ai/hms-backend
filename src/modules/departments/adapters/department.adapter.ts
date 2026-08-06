/**
 * File: department.adapter.ts
 * Module: departments
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IDepartmentOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class DepartmentAdapter implements IDepartmentOutboundPort {
  private readonly logger = new Logger(DepartmentAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('DepartmentAdapter.ping — wire external integration here');
    return true;
  }
}
