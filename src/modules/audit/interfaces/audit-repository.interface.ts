/**
 * File: audit-repository.interface.ts
 * Module: audit
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Audit } from '../domain/audit.entity';
import type { AuditQueryDto } from '../dto';

export type AuditPage = { items: Audit[]; total: number };

export interface IAuditRepository extends Repository<Audit, string> {
  findMany(query: AuditQueryDto): Promise<AuditPage>;
  softDelete(id: string): Promise<void>;
}
