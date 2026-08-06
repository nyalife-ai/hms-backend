/**
 * File: update-staff.usecase.ts
 * Module: staff
 * Purpose: Update staff.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateStaffDto } from '../dto';
import { STAFF_REPOSITORY } from '../constants/staff.constants';
import type { Staff } from '../domain/staff.entity';
import type { IStaffRepository } from '../interfaces/staff-repository.interface';

@Injectable()
export class UpdateStaffUseCase {
  public constructor(
    @Inject(STAFF_REPOSITORY) private readonly repository: IStaffRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateStaffDto,
  ): Promise<Result<Staff, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Staff', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        departmentId: dto.departmentId,
        position: dto.position,
        specialization: dto.specialization,
        qualification: dto.qualification,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        joinDate: dto.joinDate,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
