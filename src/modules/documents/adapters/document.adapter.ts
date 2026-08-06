/**
 * File: document.adapter.ts
 * Module: documents
 * Purpose: Outbound adapter stub (no infra drivers in domain).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface IDocumentOutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class DocumentAdapter implements IDocumentOutboundPort {
  private readonly logger = new Logger(DocumentAdapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('DocumentAdapter.ping — wire external integration here');
    return true;
  }
}
