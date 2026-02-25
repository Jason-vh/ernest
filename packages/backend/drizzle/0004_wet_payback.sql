ALTER TABLE "listings" ADD COLUMN "ai_positives" jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "ai_negatives" jsonb;--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "ai_summary";