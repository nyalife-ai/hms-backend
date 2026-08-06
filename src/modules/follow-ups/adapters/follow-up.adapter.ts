/**
 * File: follow-up.adapter.ts
 * Module: follow-ups
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IFollowUpOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class FollowUpAdapter implements IFollowUpOutboundPort {
  private readonly logger = new Logger(FollowUpAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('FollowUpAdapter.ping — wire external integration here');
    return true;
  }
}
