/**
 * File: staff.listener.ts
 * Module: staff
 * Purpose: @OnEvent listeners for staff.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { STAFF_EVENTS } from '../constants/staff.constants';
import { StaffCreatedEvent, StaffDeletedEvent, StaffUpdatedEvent } from '../events';

@Injectable()
export class StaffListener {
  private readonly logger = new Logger(StaffListener.name);

  @OnEvent(STAFF_EVENTS.CREATED)
  onCreated(event: StaffCreatedEvent): void {
    this.logger.log(`staff created: ${event.staffId}`);
  }

  @OnEvent(STAFF_EVENTS.UPDATED)
  onUpdated(event: StaffUpdatedEvent): void {
    this.logger.log(`staff updated: ${event.staffId}`);
  }

  @OnEvent(STAFF_EVENTS.DELETED)
  onDeleted(event: StaffDeletedEvent): void {
    this.logger.log(`staff deleted: ${event.staffId}`);
  }
}
