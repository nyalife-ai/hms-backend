/**
 * File: insurance-policies.service.ts
 * Module: insurance-policies
 * Purpose: Application service orchestrating use-cases.
 */

import {
  ConflictException,
  Injectable,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../core/contracts';
import { BaseApplicationException, NotFoundException } from '../../core/exceptions';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type { CreateInsurancePolicyDto, InsurancePoliciesQueryDto, UpdateInsurancePolicyDto } from './dto';
import { InsurancePolicyMapper } from './mappers/insurance-policy.mapper';
import { INSURANCE_POLICIES_EVENTS } from './constants/insurance-policies.constants';
import { InsurancePolicyCreatedEvent, InsurancePolicyDeletedEvent, InsurancePolicyUpdatedEvent } from './events';
import { CreateInsurancePolicyUseCase } from './use-cases/create-insurance-policy.usecase';
import { FindInsurancePolicyByIdUseCase } from './use-cases/find-insurance-policy-by-id.usecase';
import { FindAllInsurancePoliciesUseCase } from './use-cases/find-all-insurance-policies.usecase';
import { UpdateInsurancePolicyUseCase } from './use-cases/update-insurance-policy.usecase';
import { SoftDeleteInsurancePolicyUseCase } from './use-cases/soft-delete-insurance-policy.usecase';

@Injectable()
export class InsurancePoliciesService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateInsurancePolicyUseCase,
    private readonly findByIdUseCase: FindInsurancePolicyByIdUseCase,
    private readonly findAllUseCase: FindAllInsurancePoliciesUseCase,
    private readonly updateUseCase: UpdateInsurancePolicyUseCase,
    private readonly softDeleteUseCase: SoftDeleteInsurancePolicyUseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateInsurancePolicyDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(INSURANCE_POLICIES_EVENTS.CREATED, new InsurancePolicyCreatedEvent(entity.getId()));
    return InsurancePolicyMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return InsurancePolicyMapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: InsurancePoliciesQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(InsurancePolicyMapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: UpdateInsurancePolicyDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(INSURANCE_POLICIES_EVENTS.UPDATED, new InsurancePolicyUpdatedEvent(entity.getId()));
    return InsurancePolicyMapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(INSURANCE_POLICIES_EVENTS.DELETED, new InsurancePolicyDeletedEvent(id));
  }

  private unwrap<T, E>(result: Result<T, E>): T {
    if (result.isSuccess()) return result.getValue();
    const err = result.getError();
    if (err instanceof NotFoundException) {
      throw new HttpNotFoundException(err.message);
    }
    if (err instanceof BaseApplicationException) {
      throw new UnprocessableEntityException(err.message);
    }
    throw new ConflictException(String(err));
  }
}
