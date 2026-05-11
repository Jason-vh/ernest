-- Switch to rentals: drop buy-only fields and the precomputed route to Amsterdam Centraal.
ALTER TABLE "listings" DROP COLUMN IF EXISTS "route_centraal";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "ownership";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "vve_costs_monthly";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "erfpacht_costs_monthly";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "woz_value";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "buurt_woz_value";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "buurt_owner_occupied_pct";
