/** Clinical consultation narrative stored on outpatient visit payload. */

export type PastPregnancyRecord = {
  year?: string;
  outcome?: string;
  notes?: string;
};

export type GynaecologicalRecord = {
  lmpDate?: string;
  menstrualRegularity?: string;
  menstrualDurationDays?: string;
  dysmenorrhea?: string;
  papSmearNotes?: string;
  contraceptiveMethod?: string;
  sexualHealthNotes?: string;
  gynHistoryNotes?: string;
};

export type ObstetricRecord = {
  parity?: string;
  currentPregnancyNotes?: string;
  obstetricHistoryNotes?: string;
  pastPregnancies?: PastPregnancyRecord[];
};

export type ClinicalRecord = {
  priority?: string;
  chiefComplaint?: string;
  historyPresentIllness?: string;
  pastMedicalHistory?: string;
  surgicalHistory?: string;
  familyHistory?: string;
  socialHistory?: string;
  enableReproductiveContext?: boolean;
  gynaecological?: GynaecologicalRecord;
  obstetric?: ObstetricRecord;
  reviewOfSystems?: string;
  generalExamination?: string;
  systemsExamination?: string;
  impression?: string;
  treatmentPlan?: string;
  followUpInstructions?: string;
  internalNotes?: string;
};
