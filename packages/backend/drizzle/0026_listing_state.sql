-- Add unified state column to listings
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "state" text,
  ADD COLUMN IF NOT EXISTS "state_by" text REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "state_at" timestamptz;

-- Migrate existing data: viewing > applied > liked/discarded
WITH state_data AS (
  SELECT
    l.funda_id,
    CASE
      WHEN lv.funda_id IS NOT NULL THEN 'viewing'
      WHEN la.funda_id IS NOT NULL THEN 'applied'
      WHEN lr.reaction = 'favourite' THEN 'liked'
      WHEN lr.reaction = 'discarded' THEN 'discarded'
    END AS new_state,
    COALESCE(lv.scheduled_by, la.applied_by, lr.changed_by) AS new_state_by,
    COALESCE(lv.updated_at, la.created_at, lr.changed_at) AS new_state_at
  FROM listings l
  LEFT JOIN listing_viewings lv ON l.funda_id = lv.funda_id
  LEFT JOIN listing_applications la ON l.funda_id = la.funda_id
  LEFT JOIN listing_reactions lr ON l.funda_id = lr.funda_id
  WHERE lv.funda_id IS NOT NULL OR la.funda_id IS NOT NULL OR lr.funda_id IS NOT NULL
)
UPDATE listings l
SET
  state = sd.new_state,
  state_by = sd.new_state_by,
  state_at = sd.new_state_at
FROM state_data sd
WHERE l.funda_id = sd.funda_id;

DROP TABLE IF EXISTS "listing_reactions";
DROP TABLE IF EXISTS "listing_applications";
