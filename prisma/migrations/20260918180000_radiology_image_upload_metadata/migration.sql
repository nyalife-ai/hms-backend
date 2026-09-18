-- Real file upload (Stage C) needs the original filename + MIME type
-- alongside the storage key already in file_path. Nullable since existing
-- rows (created via the old client-supplied-path stub) have neither.
ALTER TABLE radiology.images
  ADD COLUMN file_name VARCHAR(255);

ALTER TABLE radiology.images
  ADD COLUMN mime_type VARCHAR(100);
