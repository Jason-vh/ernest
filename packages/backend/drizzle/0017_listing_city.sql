ALTER TABLE "listings" ADD COLUMN "city" text;--> statement-breakpoint
UPDATE "listings"
SET "city" = substring("postcode" from '^\d{4}\s?[A-Z]{2}\s+(.+)$')
WHERE "city" IS NULL AND "postcode" IS NOT NULL;
