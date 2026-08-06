/**
 * File: procedure-repository.interface.ts
 * Module: procedures
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Procedure } from '../domain/procedure.entity';
import type { ProceduresQueryDto } from '../dto';

export type ProcedurePage = { items: Procedure[]; total: number };

export interface IProcedureRepository extends Repository<Procedure, string> {
  findMany(query: ProceduresQueryDto): Promise<ProcedurePage>;
  softDelete(id: string): Promise<void>;
}
