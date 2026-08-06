/**
 * File: consultation-repository.interface.ts
 * Module: consultations
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Consultation } from '../domain/consultation.entity';
import type { ConsultationsQueryDto } from '../dto';

export type ConsultationPage = { items: Consultation[]; total: number };

export interface IConsultationRepository extends Repository<Consultation, string> {
  findMany(query: ConsultationsQueryDto): Promise<ConsultationPage>;
  softDelete(id: string): Promise<void>;
}
