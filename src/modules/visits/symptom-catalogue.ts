/**
 * Clinically sensible outpatient symptom catalogue for triage intake.
 * Selecting a symptom is a presenting complaint — not a diagnosis.
 */

import type { SymptomCatalogueItem } from './triage.types';

export const SYMPTOM_CATALOGUE: SymptomCatalogueItem[] = [
  // GENERAL
  { id: 'fever', label: 'Fever', category: 'GENERAL' },
  { id: 'chills', label: 'Chills', category: 'GENERAL' },
  { id: 'fatigue', label: 'Fatigue', category: 'GENERAL' },
  { id: 'weakness', label: 'Weakness', category: 'GENERAL' },
  { id: 'malaise', label: 'Malaise', category: 'GENERAL' },
  { id: 'weight_loss', label: 'Weight loss', category: 'GENERAL' },
  { id: 'weight_gain', label: 'Weight gain', category: 'GENERAL' },
  // PAIN
  { id: 'headache', label: 'Headache', category: 'PAIN' },
  { id: 'chest_pain', label: 'Chest pain', category: 'PAIN' },
  { id: 'abdominal_pain', label: 'Abdominal pain', category: 'PAIN' },
  { id: 'pelvic_pain', label: 'Pelvic pain', category: 'PAIN' },
  { id: 'back_pain', label: 'Back pain', category: 'PAIN' },
  { id: 'joint_pain', label: 'Joint pain', category: 'PAIN' },
  { id: 'muscle_pain', label: 'Muscle pain', category: 'PAIN' },
  { id: 'neck_pain', label: 'Neck pain', category: 'PAIN' },
  { id: 'limb_pain', label: 'Limb pain', category: 'PAIN' },
  // RESPIRATORY
  { id: 'cough', label: 'Cough', category: 'RESPIRATORY' },
  { id: 'shortness_of_breath', label: 'Shortness of breath', category: 'RESPIRATORY' },
  { id: 'wheezing', label: 'Wheezing', category: 'RESPIRATORY' },
  { id: 'difficulty_breathing', label: 'Difficulty breathing', category: 'RESPIRATORY' },
  { id: 'sore_throat', label: 'Sore throat', category: 'RESPIRATORY' },
  { id: 'nasal_congestion', label: 'Nasal congestion', category: 'RESPIRATORY' },
  // CARDIOVASCULAR
  { id: 'palpitations', label: 'Palpitations', category: 'CARDIOVASCULAR' },
  { id: 'chest_discomfort', label: 'Chest discomfort', category: 'CARDIOVASCULAR' },
  { id: 'leg_swelling', label: 'Leg swelling', category: 'CARDIOVASCULAR' },
  { id: 'fainting', label: 'Fainting', category: 'CARDIOVASCULAR' },
  // GASTROINTESTINAL
  { id: 'nausea', label: 'Nausea', category: 'GASTROINTESTINAL' },
  { id: 'vomiting', label: 'Vomiting', category: 'GASTROINTESTINAL' },
  { id: 'diarrhea', label: 'Diarrhea', category: 'GASTROINTESTINAL' },
  { id: 'constipation', label: 'Constipation', category: 'GASTROINTESTINAL' },
  { id: 'loss_of_appetite', label: 'Loss of appetite', category: 'GASTROINTESTINAL' },
  { id: 'heartburn', label: 'Heartburn', category: 'GASTROINTESTINAL' },
  { id: 'bloating', label: 'Bloating', category: 'GASTROINTESTINAL' },
  { id: 'blood_in_stool', label: 'Blood in stool', category: 'GASTROINTESTINAL' },
  // GENITOURINARY
  { id: 'painful_urination', label: 'Painful urination', category: 'GENITOURINARY' },
  { id: 'frequent_urination', label: 'Frequent urination', category: 'GENITOURINARY' },
  { id: 'urinary_urgency', label: 'Urgency', category: 'GENITOURINARY' },
  { id: 'blood_in_urine', label: 'Blood in urine', category: 'GENITOURINARY' },
  { id: 'flank_pain', label: 'Flank pain', category: 'GENITOURINARY' },
  // NEUROLOGICAL
  { id: 'dizziness', label: 'Dizziness', category: 'NEUROLOGICAL' },
  { id: 'neuro_weakness', label: 'Weakness (neurological)', category: 'NEUROLOGICAL' },
  { id: 'numbness', label: 'Numbness', category: 'NEUROLOGICAL' },
  { id: 'tingling', label: 'Tingling', category: 'NEUROLOGICAL' },
  { id: 'seizure', label: 'Seizure', category: 'NEUROLOGICAL' },
  { id: 'confusion', label: 'Confusion', category: 'NEUROLOGICAL' },
  { id: 'loss_of_consciousness', label: 'Loss of consciousness', category: 'NEUROLOGICAL' },
  // SKIN
  { id: 'rash', label: 'Rash', category: 'SKIN' },
  { id: 'itching', label: 'Itching', category: 'SKIN' },
  { id: 'skin_lesion', label: 'Skin lesion', category: 'SKIN' },
  { id: 'swelling', label: 'Swelling', category: 'SKIN' },
  // GYN / OBSTETRIC
  { id: 'vaginal_bleeding', label: 'Vaginal bleeding', category: 'GYN_OBSTETRIC' },
  { id: 'vaginal_discharge', label: 'Vaginal discharge', category: 'GYN_OBSTETRIC' },
  { id: 'gyn_pelvic_pain', label: 'Pelvic pain', category: 'GYN_OBSTETRIC' },
  { id: 'lower_abdominal_pain', label: 'Lower abdominal pain', category: 'GYN_OBSTETRIC' },
  { id: 'breast_pain', label: 'Breast pain', category: 'GYN_OBSTETRIC' },
  { id: 'reduced_fetal_movement', label: 'Reduced fetal movement', category: 'GYN_OBSTETRIC' },
  { id: 'leakage_of_fluid', label: 'Leakage of fluid', category: 'GYN_OBSTETRIC' },
  { id: 'contractions', label: 'Contractions', category: 'GYN_OBSTETRIC' },
  // OTHER
  { id: 'other', label: 'Other', category: 'OTHER' },
];

export const TRIAGE_REASON_OPTIONS = [
  'Fever / infection concern',
  'Pain',
  'Respiratory symptoms',
  'Gastrointestinal symptoms',
  'Cardiovascular symptoms',
  'Neurological symptoms',
  'Skin / soft tissue',
  'Urinary symptoms',
  'Reproductive / gynaecological',
  'Antenatal / pregnancy',
  'Chronic disease review',
  'Injury / trauma',
  'General check-up',
  'Other',
] as const;

export const TRIAGE_CONDITIONS = [
  'Hypertension',
  'Diabetes',
  'Asthma',
  'Heart disease',
  'Rheumatic heart disease',
  'Kidney disease',
  'Liver disease',
  'Epilepsy',
  'Thyroid disease',
  'Other',
] as const;

export const TRIAGE_RED_FLAGS = [
  'Severe pain',
  'Difficulty breathing',
  'Active bleeding',
  'Altered consciousness',
  'Fainting',
  'Convulsions',
  'Severe abnormal vital signs',
  'Severe weakness',
  'Other urgent concern',
] as const;
