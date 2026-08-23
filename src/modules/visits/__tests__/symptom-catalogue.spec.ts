/**
 * Visits symptom catalogue — structural integrity for triage intake.
 */

import {
  SYMPTOM_CATALOGUE,
  TRIAGE_CONDITIONS,
  TRIAGE_REASON_OPTIONS,
  TRIAGE_RED_FLAGS,
} from '../symptom-catalogue';

describe('symptom-catalogue', () => {
  it('has unique symptom ids and required fields', () => {
    const ids = SYMPTOM_CATALOGUE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SYMPTOM_CATALOGUE.length).toBeGreaterThan(20);
    for (const item of SYMPTOM_CATALOGUE) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.category).toBeTruthy();
    }
  });

  it('exposes triage option lists', () => {
    expect(TRIAGE_REASON_OPTIONS.length).toBeGreaterThan(0);
    expect(TRIAGE_CONDITIONS.length).toBeGreaterThan(0);
    expect(TRIAGE_RED_FLAGS.length).toBeGreaterThan(0);
  });
});
