/**
 * Billing settlement orchestration — persistence via IBillingRepository.
 */

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
  type SettleVisitInput,
} from './repositories/billing.repository.interface';

export type BillLine = { description: string; amount: number };

export type FeeSchedule = {
  consult: number;
  lab: number;
  medication: number;
};

@Injectable()
export class BillingSettlementService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billingRepo: IBillingRepository,
  ) {}

  async getFeeSchedule(): Promise<FeeSchedule> {
    await this.ensureFeeSchedule();
    if (!this.billingRepo.isConnected()) {
      return { consult: 2500, lab: 1500, medication: 800 };
    }
    const rows = await this.billingRepo.findActiveServicePrices([
      'CONSULT',
      'LAB',
      'MED',
    ]);
    const map = Object.fromEntries(
      rows.map((r) => [r.service_code, Number(r.standard_price)]),
    );
    return {
      consult: map.CONSULT ?? 2500,
      lab: map.LAB ?? 1500,
      medication: map.MED ?? 800,
    };
  }

  async ensureFeeSchedule(): Promise<void> {
    await this.billingRepo.ensureFeeScheduleSeed();
  }

  async settleVisit(input: SettleVisitInput): Promise<{
    invoiceId: string;
    invoiceNumber: string;
    paymentId?: string;
    claimNumber?: string;
    claimDbId?: string;
  }> {
    if (!this.billingRepo.isConnected()) {
      throw new NotFoundException('Database required for billing settlement');
    }
    try {
      return await this.billingRepo.settleVisit(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Settlement failed';
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      throw err;
    }
  }

  async syncClaimStatus(
    claimNumber: string,
    gatewayStatus: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED',
  ): Promise<void> {
    await this.billingRepo.syncClaimStatus(claimNumber, gatewayStatus);
  }
}
