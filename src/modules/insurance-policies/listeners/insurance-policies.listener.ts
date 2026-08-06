/**
 * File: insurance-policies.listener.ts
 * Module: insurance-policies
 * Purpose: @OnEvent listeners for insurance-policies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { INSURANCE_POLICIES_EVENTS } from '../constants/insurance-policies.constants';
import { InsurancePolicyCreatedEvent, InsurancePolicyDeletedEvent, InsurancePolicyUpdatedEvent } from '../events';

@Injectable()
export class InsurancePoliciesListener {
  private readonly logger = new Logger(InsurancePoliciesListener.name);

  @OnEvent(INSURANCE_POLICIES_EVENTS.CREATED)
  onCreated(event: InsurancePolicyCreatedEvent): void {
    this.logger.log(`insurance-policy created: ${event.insurancePolicyId}`);
  }

  @OnEvent(INSURANCE_POLICIES_EVENTS.UPDATED)
  onUpdated(event: InsurancePolicyUpdatedEvent): void {
    this.logger.log(`insurance-policy updated: ${event.insurancePolicyId}`);
  }

  @OnEvent(INSURANCE_POLICIES_EVENTS.DELETED)
  onDeleted(event: InsurancePolicyDeletedEvent): void {
    this.logger.log(`insurance-policy deleted: ${event.insurancePolicyId}`);
  }
}
