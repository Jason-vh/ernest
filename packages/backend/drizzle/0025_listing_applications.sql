CREATE TABLE IF NOT EXISTS "listing_applications" (
  "funda_id" text PRIMARY KEY REFERENCES "listings"("funda_id") ON DELETE CASCADE,
  "note" text,
  "applied_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Backfill sources for rows that predate the sources column
UPDATE "listings"
SET "sources" = jsonb_build_array(jsonb_build_object('source', "source", 'url', "url"))
WHERE "sources" IS NULL;
