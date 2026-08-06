import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { VisitsModule } from '../visits/visits.module';
import { InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';
import { INSURANCE_REPOSITORY } from './repositories/insurance.repository.interface';
import { PrismaInsuranceRepository } from './repositories/prisma-insurance.repository';

@Module({
  imports: [PrismaModule, AuthModule, BillingModule, VisitsModule],
  controllers: [InsuranceController],
  providers: [
    InsuranceService,
    PrismaInsuranceRepository,
    { provide: INSURANCE_REPOSITORY, useExisting: PrismaInsuranceRepository },
  ],
  exports: [InsuranceService],
})
export class InsuranceModule {}
