-- Urgency on clinical vitals (Normal / Emergency)
ALTER TABLE clinical.vital_signs
  ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

-- Patient contact email is optional; uniqueness retained when present (Postgres allows multiple NULLs)
ALTER TABLE core.users
  ALTER COLUMN email DROP NOT NULL;

-- Clear synthetic auto-generated patient emails so UI no longer shows non-existent addresses
UPDATE core.users
SET email = NULL
WHERE email ILIKE '%@patient.nyalife.health';
