/**
 * Visits persistence port — clinical.outpatient_visits + related ops.
 */

import type { Visit, VisitStage } from '../visit.types';

export const VISITS_REPOSITORY = Symbol('VISITS_REPOSITORY');

export type VisitRow = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  mrn: string;
  age: number;
  gender: string;
  phone: string;
  first_visit: boolean;
  stage: string;
  checked_in_at: Date;
  reason_for_visit?: string | null;
  additional_notes?: string | null;
  payload: unknown;
};

export interface IVisitsRepository {
  count(): Promise<number>;
  findAllOrdered(): Promise<VisitRow[]>;
  findById(id: string): Promise<VisitRow | null>;
  findByAppointmentId(appointmentId: string): Promise<VisitRow | null>;
  create(data: {
    id?: string;
    patientId: string | null;
    patientName: string;
    mrn: string;
    age: number;
    gender: string;
    phone: string;
    firstVisit: boolean;
    stage: VisitStage | string;
    checkedInAt: Date;
    reasonForVisit?: string | null;
    additionalNotes?: string | null;
    payload: unknown;
  }): Promise<VisitRow>;
  update(
    id: string,
    data: {
      stage: string;
      patientName: string;
      mrn: string;
      age: number;
      gender: string;
      phone: string;
      firstVisit: boolean;
      reasonForVisit?: string | null;
      additionalNotes?: string | null;
      triagePriority?: string | null;
      triageCompletedAt?: Date | null;
      payload: unknown;
    },
  ): Promise<VisitRow>;
  findPatientIdByMrn(mrn: string): Promise<string | null>;
  findAppointment(id: string): Promise<{ id: string; status: string } | null>;
  markAppointmentArrived(id: string): Promise<void>;
  upsertLabRequest(input: {
    requestNumber: string;
    patientId: string;
    status: string;
    notes: string;
    requestedBy: string;
    consultationId?: string | null;
  }): Promise<void>;
  findAdminUserId(): Promise<string | undefined>;
}
