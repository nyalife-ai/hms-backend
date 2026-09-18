-- Follow-ups: consultation_id becomes optional. A follow-up may legitimately
-- be scheduled for a brand-new patient who has no prior consultation yet.
ALTER TABLE clinical.follow_ups
  ALTER COLUMN consultation_id DROP NOT NULL;

ALTER TABLE clinical.follow_ups
  DROP CONSTRAINT follow_ups_consultation_id_fkey;

ALTER TABLE clinical.follow_ups
  ADD CONSTRAINT follow_ups_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES clinical.consultations(id)
  ON DELETE SET NULL;

-- Consultations: soft link back to the outpatient visit it was documented
-- from (walk-in journey), so follow-ups and other UI can resolve the real
-- "/consultations/:visitId" journey page instead of falling back to the
-- patient profile when no scheduled appointment is involved.
ALTER TABLE clinical.consultations
  ADD COLUMN visit_id UUID REFERENCES clinical.outpatient_visits(id) ON DELETE SET NULL;

CREATE INDEX idx_consultations_visit ON clinical.consultations(visit_id);
