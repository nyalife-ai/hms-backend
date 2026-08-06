export type VisitStage =
  | 'CHECKED_IN'
  | 'WAITING_DOCTOR'
  | 'IN_CONSULTATION'
  | 'LAB_PENDING'
  | 'RESULTS_READY'
  | 'READY_FOR_BILLING'
  /** Insurance claim filed with payer — waiting for adjudication before sign-off. */
  | 'CLAIM_SUBMITTED'
  | 'COMPLETED';

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
  labOrder?: {
    tests: LabTestOrder[];
    notes?: string;
    comments?: string;
    completedAt?: string;
  };
  diagnosis?: string;
  prescriptions?: PrescriptionLine[];
  followUpDate?: string;
  billing?: {
    total: number;
    mode: 'CASH' | 'CLAIM';
    claimId?: string;
    claimStatus?: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
    invoiceNumber?: string;
    receiptId?: string;
    receiptNumber?: string;
    mpesaReceipt?: string;
    paymentChannel?: 'CASH' | 'MPESA' | 'INSURANCE';
  };
  pharmacy?: {
    dispensed?: boolean;
    dispensedAt?: string;
  };
}

