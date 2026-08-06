/**
 * File: create-procedure.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateProcedureDto } from '../dto';
import { Procedure } from '../domain/procedure.entity';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import type { IProcedureRepository } from '../interfaces/procedure-repository.interface';

@Injectable()
export class CreateProcedureUseCase {
  public constructor(
    @Inject(PROCEDURES_REPOSITORY)
    private readonly repository: IProcedureRepository,
  ) {}

  public async execute(
    dto: CreateProcedureDto,
  ): Promise<Result<Procedure, string>> {
    try {
      const entity = Procedure.create({
        name: dto.name,
        description: dto.description,
        consultationId: dto.consultationId,
        patientId: dto.patientId,
        cptCode: dto.cptCode,
        performerId: dto.performerId,
        outcome: dto.outcome,
        performedAt: dto.performedAt,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
