/**
 * File: audit.adapter.ts
 * Module: audit
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IAuditOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class AuditAdapter implements IAuditOutboundPort {
  private readonly logger = new Logger(AuditAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('AuditAdapter.ping — wire external integration here');
    return true;
  }
}
