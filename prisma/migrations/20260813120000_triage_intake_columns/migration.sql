-- Optional denormalized triage queue columns (additive, nullable).
-- Authoritative structured triage remains in outpatient_visits.payload.triage
-- (same pattern as clinicalRecord). Application sorts by payload fields.

ALTER TABLE clinical.outpatient_visits
  ADD COLUMN IF NOT EXISTS triage_priority VARCHAR(20),
  ADD COLUMN IF NOT EXISTS triage_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outpatient_visits_triage_priority_idx
  ON clinical.outpatient_visits (triage_priority);

CREATE INDEX IF NOT EXISTS outpatient_visits_triage_completed_at_idx
  ON clinical.outpatient_visits (triage_completed_at);
