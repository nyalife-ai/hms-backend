-- Laboratory / billing category masters + richer test_type fields for CSV seed.

CREATE TABLE IF NOT EXISTS "laboratory"."test_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "test_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "test_categories_name_key"
  ON "laboratory"."test_categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "test_categories_slug_key"
  ON "laboratory"."test_categories"("slug");

CREATE TABLE IF NOT EXISTS "billing"."service_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_categories_name_key"
  ON "billing"."service_categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "service_categories_slug_key"
  ON "billing"."service_categories"("slug");

ALTER TABLE "laboratory"."test_types"
  ALTER COLUMN "test_name" TYPE VARCHAR(255);

ALTER TABLE "laboratory"."test_types"
  ADD COLUMN IF NOT EXISTS "category_id" UUID,
  ADD COLUMN IF NOT EXISTS "units" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "normal_range" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "template" JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'test_types_category_id_fkey'
  ) THEN
    ALTER TABLE "laboratory"."test_types"
      ADD CONSTRAINT "test_types_category_id_fkey"
      FOREIGN KEY ("category_id")
      REFERENCES "laboratory"."test_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "test_types_category_id_idx"
  ON "laboratory"."test_types"("category_id");

ALTER TABLE "billing"."services"
  ALTER COLUMN "service_name" TYPE VARCHAR(255);

ALTER TABLE "billing"."services"
  ALTER COLUMN "category" TYPE VARCHAR(100);

ALTER TABLE "billing"."services"
  ALTER COLUMN "service_code" TYPE VARCHAR(50);

ALTER TABLE "billing"."services"
  ADD COLUMN IF NOT EXISTS "category_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_category_id_fkey'
  ) THEN
    ALTER TABLE "billing"."services"
      ADD CONSTRAINT "services_category_id_fkey"
      FOREIGN KEY ("category_id")
      REFERENCES "billing"."service_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "services_category_id_idx"
  ON "billing"."services"("category_id");
