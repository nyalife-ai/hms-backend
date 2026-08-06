/**
 * File: update-procedure.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateProcedureDto } from '../dto';
import { PROCEDURES_REPOSITORY } from '../constants/procedures.constants';
import type { Procedure } from '../domain/procedure.entity';
import type { IProcedureRepository } from '../interfaces/procedure-repository.interface';

@Injectable()
export class UpdateProcedureUseCase {
  public constructor(
    @Inject(PROCEDURES_REPOSITORY)
    private readonly repository: IProcedureRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateProcedureDto,
  ): Promise<Result<Procedure, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Procedure', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        cptCode: dto.cptCode,
        performerId: dto.performerId,
        outcome: dto.outcome,
        performedAt: dto.performedAt,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
