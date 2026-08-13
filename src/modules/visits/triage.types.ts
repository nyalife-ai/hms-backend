/**
 * Structured clinical triage intake — stored on outpatient visit payload.
 * Triage records presenting complaints / observations, NOT diagnoses.
 */

export type TriagePriority = 'NORMAL' | 'URGENT' | 'EMERGENCY';

export type SymptomSeverity = 'MILD' | 'MODERATE' | 'SEVERE';
export type SymptomOnset = 'SUDDEN' | 'GRADUAL' | 'UNKNOWN';
export type SymptomProgression =
  | 'IMPROVING'
  | 'STABLE'
  | 'WORSENING'
  | 'UNKNOWN';
export type DurationUnit = 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS' | 'YEARS';

export type GlucoseContext = 'RANDOM' | 'FASTING' | 'OTHER' | 'UNKNOWN';

export type TriageSymptom = {
  /** Catalogue id or OTHER */
  symptomId: string;
  /** Display label */
  symptom: string;
  category?: string;
  onset?: SymptomOnset;
  durationValue?: string;
  durationUnit?: DurationUnit;
  severity?: SymptomSeverity;
  progression?: SymptomProgression;
  associatedSymptoms?: string;
  notes?: string;
};

export type TriageRelevantHistory = {
  conditions?: string[];
  conditionsOther?: string;
  currentMedications?: string;
  allergiesKnown?: boolean;
  allergens?: string;
  allergyReaction?: string;
  surgicalHistory?: string;
};

export type TriageAntenatalScreening = {
  pregnancyStatus?: string;
  lmp?: string;
  gestationalAgeWeeks?: string;
  edd?: string;
  gravida?: string;
  para?: string;
  currentConcerns?: string;
  warningSymptoms?: string[];
  fetalHeartRate?: string;
  fundalHeightCm?: string;
};

export type TriageGynScreening = {
  pregnancyStatus?: string;
  possiblePregnancy?: boolean;
  lmp?: string;
  menstrualConcern?: string;
  vaginalBleeding?: boolean;
  vaginalDischarge?: boolean;
  pelvicPain?: boolean;
  urinarySymptoms?: boolean;
  otherConcern?: string;
};

export type TriagePaediatricScreening = {
  headCircumferenceCm?: string;
  muacCm?: string;
  feedingConcerns?: string;
  developmentalConcerns?: string;
  vaccinationNotes?: string;
  otherConcerns?: string;
};

export type TriageChronicScreening = {
  conditions?: string[];
  relevantSymptoms?: string;
  currentTreatment?: string;
};

export type TriageAssessment = {
  generalAppearance?: string;
  mentalStatus?: string;
  mobility?: string;
  respiratoryEffort?: string;
  redFlags?: string[];
};

export type TriageDisposition =
  | 'SEND_TO_DOCTOR'
  | 'OBSERVE'
  | 'REFER_EMERGENCY'
  | 'OTHER';

/** Expanded vitals — core 7 remain required at triage; rest optional. */
export type TriageVitals = {
  temperature: string;
  systolic: string;
  diastolic: string;
  pulse: string;
  respRate: string;
  spo2: string;
  weightKg: string;
  heightCm?: string;
  /** Calculated server-side when height+weight present */
  bmi?: string;
  painScore?: string;
  painLocation?: string;
  bloodGlucose?: string;
  bloodGlucoseContext?: GlucoseContext;
  headCircumferenceCm?: string;
  muacCm?: string;
  temperatureMethod?: string;
  recordedAt?: string;
  recordedBy?: string;
};

export type TriageRecord = {
  /** Clinical reason for visit (authoritative after triage) */
  reasonForVisit: string;
  reasonForVisitOther?: string;
  chiefComplaint: string;
  symptoms: TriageSymptom[];
  relevantHistory?: TriageRelevantHistory;
  contextsEnabled?: Array<
    'ANTENATAL' | 'PAEDIATRIC' | 'GYNAECOLOGICAL' | 'CHRONIC' | 'OTHER'
  >;
  antenatal?: TriageAntenatalScreening;
  gynaecological?: TriageGynScreening;
  paediatric?: TriagePaediatricScreening;
  chronic?: TriageChronicScreening;
  assessment?: TriageAssessment;
  /** Clinical triage notes (not reception admin notes) */
  notes?: string;
  priority: TriagePriority;
  priorityReason?: string;
  disposition?: TriageDisposition;
  dispositionNotes?: string;
  completedAt: string;
  recordedByName?: string;
  recordedByUserId?: string;
  /** Snapshot of reception reason at triage time (compatibility) */
  receptionReasonSnapshot?: string;
};

export type SymptomCatalogueItem = {
  id: string;
  label: string;
  category: string;
};
