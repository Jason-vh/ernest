CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"funda_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "ai_description" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_funda_id_listings_funda_id_fk" FOREIGN KEY ("funda_id") REFERENCES "public"."listings"("funda_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_poll_idx" ON "jobs" USING btree ("status","run_after","type");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_type_funda_idx" ON "jobs" USING btree ("type","funda_id");