/**
 * File: create-bed.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateBedDto } from '../dto';
import { Bed } from '../domain/bed.entity';
import { BEDS_REPOSITORY } from '../constants/beds.constants';
import type { IBedRepository } from '../interfaces/bed-repository.interface';

@Injectable()
export class CreateBedUseCase {
  public constructor(
    @Inject(BEDS_REPOSITORY) private readonly repository: IBedRepository,
  ) {}

  public async execute(dto: CreateBedDto): Promise<Result<Bed, string>> {
    try {
      const entity = Bed.create({
        name: dto.name,
        wardId: dto.wardId,
        description: dto.description,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
