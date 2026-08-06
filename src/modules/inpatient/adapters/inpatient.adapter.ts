/**
 * File: inpatient.adapter.ts
 * Module: inpatient
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IInpatientOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class InpatientAdapter implements IInpatientOutboundPort {
  private readonly logger = new Logger(InpatientAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('InpatientAdapter.ping — wire external integration here');
    return true;
  }
}
