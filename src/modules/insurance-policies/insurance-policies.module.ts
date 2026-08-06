/**
 * File: insurance-policies.module.ts
 * Module: insurance-policies
 * Purpose: Nest module wiring repository factory and use-cases.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { INSURANCE_POLICIES_REPOSITORY } from './constants/insurance-policies.constants';
import { InsurancePoliciesController } from './insurance-policies.controller';
import { InsurancePoliciesService } from './insurance-policies.service';
import { InsurancePoliciesListener } from './listeners/insurance-policies.listener';
import { InsurancePolicyRepositoryProvider } from './repositories/insurance-policies.repository';
import { PrismaInsurancePolicyRepository } from './repositories/prisma/prisma-insurance-policy.repository';
import { CreateInsurancePolicyUseCase } from './use-cases/create-insurance-policy.usecase';
import { FindInsurancePolicyByIdUseCase } from './use-cases/find-insurance-policy-by-id.usecase';
import { FindAllInsurancePoliciesUseCase } from './use-cases/find-all-insurance-policies.usecase';
import { UpdateInsurancePolicyUseCase } from './use-cases/update-insurance-policy.usecase';
import { SoftDeleteInsurancePolicyUseCase } from './use-cases/soft-delete-insurance-policy.usecase';

@Module({
  imports: [PrismaModule],
  controllers: [InsurancePoliciesController],
  providers: [
    InsurancePoliciesService,
    InsurancePoliciesListener,
    InsurancePolicyRepositoryProvider,
    PrismaInsurancePolicyRepository,
    CreateInsurancePolicyUseCase,
    FindInsurancePolicyByIdUseCase,
    FindAllInsurancePoliciesUseCase,
    UpdateInsurancePolicyUseCase,
    SoftDeleteInsurancePolicyUseCase,
  ],
  exports: [InsurancePoliciesService, INSURANCE_POLICIES_REPOSITORY],
})
export class InsurancePoliciesModule {}
