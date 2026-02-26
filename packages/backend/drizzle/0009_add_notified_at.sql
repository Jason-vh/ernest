ALTER TABLE "listings" ADD COLUMN "notified_at" timestamp with time zone;

-- Backfill: mark existing listings that already have a completed telegram-notify job
UPDATE "listings" SET "notified_at" = j."updated_at"
FROM "jobs" j
WHERE j."funda_id" = "listings"."funda_id"
  AND j."type" = 'telegram-notify'
  AND j."status" = 'completed';
