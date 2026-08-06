import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { BillingController } from './billing.controller';
import { BillingSettlementService } from './billing-settlement.service';
import { CheckoutService } from './checkout.service';
import { BILLING_REPOSITORY } from './repositories/billing.repository.interface';
import { PrismaBillingRepository } from './repositories/prisma-billing.repository';

@Module({
  imports: [PrismaModule, AuthModule, PharmacyModule],
  controllers: [BillingController],
  providers: [
    BillingSettlementService,
    CheckoutService,
    PrismaBillingRepository,
    { provide: BILLING_REPOSITORY, useExisting: PrismaBillingRepository },
  ],
  exports: [
    BillingSettlementService,
    CheckoutService,
    PharmacyModule,
  ],
})
export class BillingModule {}
