/**
 * File: insurance-policies.events.ts
 * Module: insurance-policies
 * Purpose: Event payload classes.
 */

import { INSURANCE_POLICIES_EVENTS } from '../constants/insurance-policies.constants';

export class InsurancePolicyCreatedEvent {
  public static readonly name = INSURANCE_POLICIES_EVENTS.CREATED;
  public constructor(public readonly insurancePolicyId: string, public readonly occurredAt = new Date()) {}
}

export class InsurancePolicyUpdatedEvent {
  public static readonly name = INSURANCE_POLICIES_EVENTS.UPDATED;
  public constructor(public readonly insurancePolicyId: string, public readonly occurredAt = new Date()) {}
}

export class InsurancePolicyDeletedEvent {
  public static readonly name = INSURANCE_POLICIES_EVENTS.DELETED;
  public constructor(public readonly insurancePolicyId: string, public readonly occurredAt = new Date()) {}
}
