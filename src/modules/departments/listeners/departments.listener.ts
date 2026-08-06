/**
 * File: departments.listener.ts
 * Module: departments
 * Purpose: @OnEvent listeners for departments.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DEPARTMENTS_EVENTS } from '../constants/departments.constants';
import { DepartmentCreatedEvent, DepartmentDeletedEvent, DepartmentUpdatedEvent } from '../events';

@Injectable()
export class DepartmentsListener {
  private readonly logger = new Logger(DepartmentsListener.name);

  @OnEvent(DEPARTMENTS_EVENTS.CREATED)
  onCreated(event: DepartmentCreatedEvent): void {
    this.logger.log(`department created: ${event.departmentId}`);
  }

  @OnEvent(DEPARTMENTS_EVENTS.UPDATED)
  onUpdated(event: DepartmentUpdatedEvent): void {
    this.logger.log(`department updated: ${event.departmentId}`);
  }

  @OnEvent(DEPARTMENTS_EVENTS.DELETED)
  onDeleted(event: DepartmentDeletedEvent): void {
    this.logger.log(`department deleted: ${event.departmentId}`);
  }
}
