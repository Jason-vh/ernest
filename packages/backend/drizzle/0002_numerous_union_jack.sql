CREATE TABLE "listing_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"funda_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_reactions" (
	"funda_id" text PRIMARY KEY NOT NULL,
	"reaction" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_notes" ADD CONSTRAINT "listing_notes_funda_id_listings_funda_id_fk" FOREIGN KEY ("funda_id") REFERENCES "public"."listings"("funda_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_notes" ADD CONSTRAINT "listing_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reactions" ADD CONSTRAINT "listing_reactions_funda_id_listings_funda_id_fk" FOREIGN KEY ("funda_id") REFERENCES "public"."listings"("funda_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reactions" ADD CONSTRAINT "listing_reactions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_notes_funda_user_idx" ON "listing_notes" USING btree ("funda_id","user_id");