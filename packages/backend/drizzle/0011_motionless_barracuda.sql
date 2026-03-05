CREATE TABLE "manual_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"funda_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "manual_listings_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;