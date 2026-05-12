ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'funda';
