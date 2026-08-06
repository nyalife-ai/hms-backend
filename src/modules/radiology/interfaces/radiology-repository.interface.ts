/**
 * File: radiology-repository.interface.ts
 * Module: radiology
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Radiology } from '../domain/radiology.entity';
import type { RadiologyQueryDto } from '../dto';

export type RadiologyPage = { items: Radiology[]; total: number };

export interface IRadiologyRepository extends Repository<Radiology, string> {
  findMany(query: RadiologyQueryDto): Promise<RadiologyPage>;
  softDelete(id: string): Promise<void>;
}
