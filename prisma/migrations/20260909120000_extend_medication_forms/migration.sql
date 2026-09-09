-- Extend accepted medication forms to cover the common formulations used in import data.
ALTER TABLE pharmacy.medications
  DROP CONSTRAINT IF EXISTS medications_form_check;

ALTER TABLE pharmacy.medications
  ADD CONSTRAINT medications_form_check
  CHECK (form IN (
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
    'SUPPOSITORY'
  ));
