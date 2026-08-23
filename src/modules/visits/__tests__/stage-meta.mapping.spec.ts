/**
 * STAGE_META ↔ PIPELINE_STEPS alignment (patient workflow stepper).
 * Mirrors hms-ui/src/lib/visits.tsx — keep in sync when remapping stages.
 */

const PIPELINE_STEPS = [
  'Reception',
  'Triage',
  'Doctor',
  'Laboratory',
  'Diagnosis',
  'Billing',
  'Insurer',
  'Done',
] as const;

const STAGE_META = {
  CHECKED_IN: { label: 'Waiting for Triage', step: 2 },
  AWAITING_PAYMENT: { label: 'Pay at Finance', step: 1 },
  WAITING_DOCTOR: { label: 'Waiting for Doctor', step: 3 },
  IN_CONSULTATION: { label: 'In Consultation', step: 3 },
  LAB_PENDING: { label: 'At Laboratory', step: 4 },
  RESULTS_READY: { label: 'Lab Results Ready', step: 5 },
  READY_FOR_BILLING: { label: 'Ready for Billing', step: 6 },
  CLAIM_SUBMITTED: { label: 'Awaiting Insurer', step: 7 },
  COMPLETED: { label: 'Completed', step: 8 },
} as const;

describe('STAGE_META pipeline mapping', () => {
  it('maps CHECKED_IN to Triage (step 2), not Reception', () => {
    expect(STAGE_META.CHECKED_IN.step).toBe(2);
    expect(PIPELINE_STEPS[STAGE_META.CHECKED_IN.step - 1]).toBe('Triage');
  });

  it('maps WAITING_DOCTOR to Doctor', () => {
    expect(STAGE_META.WAITING_DOCTOR.step).toBe(3);
    expect(PIPELINE_STEPS[STAGE_META.WAITING_DOCTOR.step - 1]).toBe('Doctor');
  });

  it('keeps AWAITING_PAYMENT at Reception', () => {
    expect(PIPELINE_STEPS[STAGE_META.AWAITING_PAYMENT.step - 1]).toBe(
      'Reception',
    );
  });
});
