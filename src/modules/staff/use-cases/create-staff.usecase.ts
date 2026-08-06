/**
 * File: create-staff.usecase.ts
 * Module: staff
 * Purpose: Create staff use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateStaffDto } from '../dto';
import { Staff } from '../domain/staff.entity';
import { STAFF_REPOSITORY } from '../constants/staff.constants';
import type { IStaffRepository } from '../interfaces/staff-repository.interface';

@Injectable()
export class CreateStaffUseCase {
  public constructor(
    @Inject(STAFF_REPOSITORY) private readonly repository: IStaffRepository,
  ) {}

  public async execute(dto: CreateStaffDto): Promise<Result<Staff, string>> {
    try {
      const entity = Staff.create({
        name: dto.name,
        description: dto.description,
        userId: dto.userId,
        employeeId: dto.employeeId,
        joinDate: dto.joinDate,
        departmentId: dto.departmentId,
        position: dto.position,
        specialization: dto.specialization,
        qualification: dto.qualification,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
