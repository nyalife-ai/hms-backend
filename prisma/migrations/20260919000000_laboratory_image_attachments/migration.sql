-- Real clinical image/attachment support for laboratory requests (microscopy,
-- specimen photographs, blood film, culture images) — mirrors radiology's
-- `Images` model, using the same global StorageProvider so no second file
-- storage system is introduced.
CREATE TABLE laboratory.laboratory_images (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255),
  mime_type VARCHAR(100),
  description VARCHAR(255),
  file_size BIGINT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_images_pkey PRIMARY KEY (id),
  CONSTRAINT laboratory_images_request_id_fkey FOREIGN KEY (request_id)
    REFERENCES laboratory.requests(id) ON DELETE CASCADE,
  CONSTRAINT laboratory_images_uploaded_by_fkey FOREIGN KEY (uploaded_by)
    REFERENCES core.users(id)
);

CREATE INDEX idx_laboratory_image_request ON laboratory.laboratory_images(request_id);
