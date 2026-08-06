/**
 * File: procedure.adapter.ts
 * Module: procedures
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IProcedureOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class ProcedureAdapter implements IProcedureOutboundPort {
  private readonly logger = new Logger(ProcedureAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('ProcedureAdapter.ping — wire external integration here');
    return true;
  }
}
