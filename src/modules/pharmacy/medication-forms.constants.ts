export const MEDICATION_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'CREAM',
  'OTHER',
  'AMPOULE',
  'DROPS',
  'SUSPENSION',
  'OINTMENT',
  'SACHET',
  'INHALER',
  'SUPPOSITORY',
] as const;

export type MedicationForm = (typeof MEDICATION_FORMS)[number];
