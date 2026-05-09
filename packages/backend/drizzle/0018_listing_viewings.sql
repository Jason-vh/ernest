CREATE TABLE "listing_viewings" (
	"funda_id" text PRIMARY KEY NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"note" text,
	"scheduled_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_viewings" ADD CONSTRAINT "listing_viewings_funda_id_listings_funda_id_fk" FOREIGN KEY ("funda_id") REFERENCES "public"."listings"("funda_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_viewings" ADD CONSTRAINT "listing_viewings_scheduled_by_users_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
