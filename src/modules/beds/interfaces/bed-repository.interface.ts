/**
 * File: bed-repository.interface.ts
 * Module: beds
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Bed } from '../domain/bed.entity';
import type { BedsQueryDto } from '../dto';

export type BedPage = { items: Bed[]; total: number };

export interface IBedRepository extends Repository<Bed, string> {
  findMany(query: BedsQueryDto): Promise<BedPage>;
  softDelete(id: string): Promise<void>;
}
