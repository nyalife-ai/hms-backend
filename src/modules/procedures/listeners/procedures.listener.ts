/**
 * File: procedures.listener.ts
 * Module: procedures
 * Purpose: @OnEvent listeners for procedures.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PROCEDURES_EVENTS } from '../constants/procedures.constants';
import { ProcedureCreatedEvent, ProcedureDeletedEvent, ProcedureUpdatedEvent } from '../events';

@Injectable()
export class ProceduresListener {
  private readonly logger = new Logger(ProceduresListener.name);

  @OnEvent(PROCEDURES_EVENTS.CREATED)
  onCreated(event: ProcedureCreatedEvent): void {
    this.logger.log(`procedure created: ${event.procedureId}`);
  }

  @OnEvent(PROCEDURES_EVENTS.UPDATED)
  onUpdated(event: ProcedureUpdatedEvent): void {
    this.logger.log(`procedure updated: ${event.procedureId}`);
  }

  @OnEvent(PROCEDURES_EVENTS.DELETED)
  onDeleted(event: ProcedureDeletedEvent): void {
    this.logger.log(`procedure deleted: ${event.procedureId}`);
  }
}
