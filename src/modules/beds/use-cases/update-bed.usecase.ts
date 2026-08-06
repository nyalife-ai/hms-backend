/**
 * File: update-bed.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateBedDto } from '../dto';
import { BEDS_REPOSITORY } from '../constants/beds.constants';
import type { Bed } from '../domain/bed.entity';
import type { IBedRepository } from '../interfaces/bed-repository.interface';

@Injectable()
export class UpdateBedUseCase {
  public constructor(
    @Inject(BEDS_REPOSITORY) private readonly repository: IBedRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateBedDto,
  ): Promise<Result<Bed, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Bed', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
