/**
 * File: insurance-policy.adapter.ts
 * Module: insurance-policies
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IInsurancePolicyOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class InsurancePolicyAdapter implements IInsurancePolicyOutboundPort {
  private readonly logger = new Logger(InsurancePolicyAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('InsurancePolicyAdapter.ping — wire external integration here');
    return true;
  }
}
