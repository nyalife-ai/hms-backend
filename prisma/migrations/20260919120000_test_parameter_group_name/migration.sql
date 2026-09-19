-- Optional display grouping within a panel (e.g. "Erythrocytes"/"Leucocytes"/
-- "Platelets" inside a CBC panel). Nullable and admin-configurable per
-- parameter — the report renderer falls back to a flat analyte list when a
-- test type's parameters have no group set, so this is purely additive.
ALTER TABLE laboratory.test_parameters
  ADD COLUMN group_name VARCHAR(100);
