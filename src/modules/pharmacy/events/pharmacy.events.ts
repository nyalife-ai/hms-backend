/**
 * File: pharmacy.events.ts
 * Module: pharmacy
 * Purpose: Event payload classes.
 */

import { PHARMACY_EVENTS } from '../constants/pharmacy.constants';

export class PharmacyCreatedEvent {
  public static readonly name = PHARMACY_EVENTS.CREATED;
  public constructor(public readonly pharmacyId: string, public readonly occurredAt = new Date()) {}
}

export class PharmacyUpdatedEvent {
  public static readonly name = PHARMACY_EVENTS.UPDATED;
  public constructor(public readonly pharmacyId: string, public readonly occurredAt = new Date()) {}
}

export class PharmacyDeletedEvent {
  public static readonly name = PHARMACY_EVENTS.DELETED;
  public constructor(public readonly pharmacyId: string, public readonly occurredAt = new Date()) {}
}
