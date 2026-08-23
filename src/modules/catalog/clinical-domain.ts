/**
 * Domain relationships (source of truth: prisma/schema.prisma)
 *
 * Patient
 *   ├── Appointments (clinical.appointments.patient_id)
 *   │     └── Consultations? (clinical.consultations.appointment_id UNIQUE, optional)
 *   ├── OutpatientVisits (clinical.outpatient_visits.patient_id, optional)
 *   │     └── Soft-link to Appointment via payload.appointmentId (NO FK)
 *   │     └── Pipeline stages live here; UI route /consultations/:id = VISIT id
 *   ├── Consultations (clinical.consultations.patient_id)
 *   │     ├── Diagnoses (required consultation_id)
 *   │     ├── FollowUps (required consultation_id)
 *   │     ├── VitalSigns? (optional consultation_id)
 *   │     ├── LaboratoryRequests? (optional consultation_id)
 *   │     └── Prescriptions? (optional consultation_id)
 *   ├── VitalSigns, Prescriptions, LaboratoryRequests (patient_id required)
 *   └── FollowUps (patient_id + consultation_id required)
 *
 * Appointment ≠ Visit. Visit is created at check-in; Consultations row is
 * mirrored from the visit pipeline (best-effort) for catalog/history views.
 * Journey UI always uses OutpatientVisits.id via /consultations/:visitId.
 */
export const CLINICAL_DOMAIN_NOTE = true;
