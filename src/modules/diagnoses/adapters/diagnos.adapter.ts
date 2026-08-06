/**
 * File: diagnos.adapter.ts
 * Module: diagnoses
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IDiagnosOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class DiagnosAdapter implements IDiagnosOutboundPort {
  private readonly logger = new Logger(DiagnosAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('DiagnosAdapter.ping — wire external integration here');
    return true;
  }
}
