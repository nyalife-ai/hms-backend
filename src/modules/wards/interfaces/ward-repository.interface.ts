/**
 * File: ward-repository.interface.ts
 * Module: wards
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Ward } from '../domain/ward.entity';
import type { WardsQueryDto } from '../dto';

export type WardPage = { items: Ward[]; total: number };

export interface IWardRepository extends Repository<Ward, string> {
  findMany(query: WardsQueryDto): Promise<WardPage>;
  softDelete(id: string): Promise<void>;
}
