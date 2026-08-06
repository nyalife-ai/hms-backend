/**
 * File: laboratory.adapter.ts
 * Module: laboratory
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ILaboratoryOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class LaboratoryAdapter implements ILaboratoryOutboundPort {
  private readonly logger = new Logger(LaboratoryAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('LaboratoryAdapter.ping — wire external integration here');
    return true;
  }
}
