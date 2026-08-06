/**
 * File: diagnos-repository.interface.ts
 * Module: diagnoses
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Diagnos } from '../domain/diagnos.entity';
import type { DiagnosesQueryDto } from '../dto';

export type DiagnosPage = { items: Diagnos[]; total: number };

export interface IDiagnosRepository extends Repository<Diagnos, string> {
  findMany(query: DiagnosesQueryDto): Promise<DiagnosPage>;
  softDelete(id: string): Promise<void>;
}
