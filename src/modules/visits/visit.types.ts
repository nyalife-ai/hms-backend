import type { ClinicalRecord } from './clinical-record.types';

export type VisitStage =
  | 'CHECKED_IN'
  /** Optional consult fee charged at triage — patient sent to finance to pay. */
  | 'AWAITING_PAYMENT'
  | 'WAITING_DOCTOR'
  | 'IN_CONSULTATION'
  | 'LAB_PENDING'
  | 'RESULTS_READY'
  | 'READY_FOR_BILLING'
  /** Insurance claim filed with payer — waiting for adjudication before sign-off. */
  | 'CLAIM_SUBMITTED'
  | 'COMPLETED';

export type ConsultFeeStatus = 'PENDING' | 'PAID' | 'WAIVED';

export type InsuranceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Vitals {
  temperature: string;
  systolic: string;
  diastolic: string;
  pulse: string;
  respRate: string;
  spo2: string;
  weightKg: string;
}

export interface LabTestOrder {
  name: string;
  unit: string;
  range: string;
  result?: string;
}

export interface PrescriptionLine {
  medication: string;
  /** Formulary medication id when prescribed from catalog */
  medicationId?: string;
  dosage: string;
  frequency: string;
  duration: string;
  /** Packs / units to dispense. Defaults to 1 when omitted. */
  quantity?: number;
}

/** Billable clinical service / procedure / surgery selected during consult. */
export interface OrderedClinicalItem {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  unitPrice: string;
}

export interface Visit {
  id: string;
  patientName: string;
  mrn: string;
  age: number;
  gender: 'Male' | 'Female';
  phone: string;
  firstVisit: boolean;
  /** clinical.appointments id when checked in from the schedule */
  appointmentId?: string;
  /** Reception: why the patient is presenting */
  reasonForVisit?: string;
  /** Reception free-text notes cascaded with the visit */
  additionalNotes?: string;
  payment: {
    method: 'CASH' | 'INSURANCE';
    provider?: string;
    providerId?: string;
    policyNumber?: string;
    status?: InsuranceStatus;
    memberName?: string;
    benefitBalance?: number;
    authorizationCode?: string;
    /** Slade360 auth_token from start_visit */
    authToken?: string;
    /** Slade360 edi_auth_guid — used for reservations / claims */
    ediAuthGuid?: string;
    benefitCode?: string;
    benefitType?: string;
    schemeName?: string;
    schemeCode?: string;
  };
  stage: VisitStage;
  checkedInAt: string;
  vitals?: Vitals;
  nurseName?: string;
  doctorName?: string;
  /** core.staff_profiles id assigned at triage */
  doctorStaffId?: string;
  labOrder?: {
    tests: LabTestOrder[];
    notes?: string;
    comments?: string;
    completedAt?: string;
  };
  diagnosis?: string;
  prescriptions?: PrescriptionLine[];
  followUpDate?: string;
  /** Full doctor clinical narrative (SOAP + gyn/obs when enabled). */
  clinicalRecord?: ClinicalRecord;
  /** Services & procedures ordered during consultation (billed on complete). */
  orderedServices?: OrderedClinicalItem[];
  /** Surgeries ordered during consultation (billed on complete). */
  orderedSurgeries?: OrderedClinicalItem[];
  billing?: {
    total: number;
    mode: 'CASH' | 'CLAIM';
    claimId?: string;
    claimStatus?: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
    invoiceId?: string;
    invoiceNumber?: string;
    receiptId?: string;
    receiptNumber?: string;
    mpesaReceipt?: string;
    paymentChannel?: 'CASH' | 'MPESA' | 'INSURANCE';
    /** Optional consultation fee charged at triage before seeing a doctor. */
    consultFeeStatus?: ConsultFeeStatus;
    consultFeeAmount?: number;
    consultFeePaidAt?: string;
  };
  pharmacy?: {
    dispensed?: boolean;
    dispensedAt?: string;
    prescriptionId?: string;
    prescriptionNumber?: string;
    sentAt?: string;
  };
}

