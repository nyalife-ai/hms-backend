/**
 * File: staff-repository.interface.ts
 * Module: staff
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Staff } from '../domain/staff.entity';
import type { StaffQueryDto } from '../dto';

export type StaffPage = { items: Staff[]; total: number };

export interface IStaffRepository extends Repository<Staff, string> {
  findMany(query: StaffQueryDto): Promise<StaffPage>;
  softDelete(id: string): Promise<void>;
}
