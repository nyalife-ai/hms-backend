/**
 * File: update-ward.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateWardDto } from '../dto';
import { WARDS_REPOSITORY } from '../constants/wards.constants';
import type { Ward } from '../domain/ward.entity';
import type { IWardRepository } from '../interfaces/ward-repository.interface';

@Injectable()
export class UpdateWardUseCase {
  public constructor(
    @Inject(WARDS_REPOSITORY) private readonly repository: IWardRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateWardDto,
  ): Promise<Result<Ward, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Ward', id));
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
