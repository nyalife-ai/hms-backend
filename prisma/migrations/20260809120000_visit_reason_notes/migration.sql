-- Reason for visit + reception notes on outpatient pipeline
ALTER TABLE clinical.outpatient_visits
  ADD COLUMN IF NOT EXISTS reason_for_visit TEXT,
  ADD COLUMN IF NOT EXISTS additional_notes TEXT;
