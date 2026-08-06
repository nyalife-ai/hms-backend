import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { VISITS_REPOSITORY } from './repositories/visits.repository.interface';
import { PrismaVisitsRepository } from './repositories/prisma-visits.repository';

@Module({
  imports: [PrismaModule, AuthModule, BillingModule],
  controllers: [VisitsController],
  providers: [
    VisitsService,
    PrismaVisitsRepository,
    { provide: VISITS_REPOSITORY, useExisting: PrismaVisitsRepository },
  ],
  exports: [VisitsService],
})
export class VisitsModule {}
