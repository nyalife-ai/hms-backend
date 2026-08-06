/**
 * File: pharmacy.listener.ts
 * Module: pharmacy
 * Purpose: @OnEvent listeners for pharmacy.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PHARMACY_EVENTS } from '../constants/pharmacy.constants';
import { PharmacyCreatedEvent, PharmacyDeletedEvent, PharmacyUpdatedEvent } from '../events';

@Injectable()
export class PharmacyListener {
  private readonly logger = new Logger(PharmacyListener.name);

  @OnEvent(PHARMACY_EVENTS.CREATED)
  onCreated(event: PharmacyCreatedEvent): void {
    this.logger.log(`pharmacy created: ${event.pharmacyId}`);
  }

  @OnEvent(PHARMACY_EVENTS.UPDATED)
  onUpdated(event: PharmacyUpdatedEvent): void {
    this.logger.log(`pharmacy updated: ${event.pharmacyId}`);
  }

  @OnEvent(PHARMACY_EVENTS.DELETED)
  onDeleted(event: PharmacyDeletedEvent): void {
    this.logger.log(`pharmacy deleted: ${event.pharmacyId}`);
  }
}
