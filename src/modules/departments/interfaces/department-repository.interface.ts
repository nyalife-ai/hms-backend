/**
 * File: department-repository.interface.ts
 * Module: departments
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Department } from '../domain/department.entity';
import type { DepartmentsQueryDto } from '../dto';

export type DepartmentPage = { items: Department[]; total: number };

export interface IDepartmentRepository extends Repository<Department, string> {
  findMany(query: DepartmentsQueryDto): Promise<DepartmentPage>;
  softDelete(id: string): Promise<void>;
}
