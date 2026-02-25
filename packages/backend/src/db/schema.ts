import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  customType,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { RouteResult } from "@/services/valhalla";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

const bytea = customType<{ data: Uint8Array; driverValue: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: unknown): Uint8Array {
    if (!Buffer.isBuffer(value)) {
      throw new Error("Expected Buffer from database driver for bytea column");
    }
    return new Uint8Array(value);
  },
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  webauthnUserId: text("webauthn_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: bytea("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: jsonb("transports").$type<AuthenticatorTransportFuture[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challenges = pgTable("challenges", {
  id: text("id").primaryKey(),
  challenge: text("challenge").notNull(),
  type: text("type").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Credential = InferSelectModel<typeof credentials>;
export type NewCredential = InferInsertModel<typeof credentials>;
export type Challenge = InferSelectModel<typeof challenges>;
export type NewChallenge = InferInsertModel<typeof challenges>;

export const listings = pgTable("listings", {
  // Identity
  fundaId: text("funda_id").primaryKey(),
  url: text("url").notNull(),

  // Core property data
  address: text("address").notNull(),
  postcode: text("postcode"),
  neighbourhood: text("neighbourhood"),
  price: integer("price").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  livingArea: integer("living_area").notNull(),
  energyLabel: text("energy_label"),
  objectType: text("object_type"),
  constructionYear: integer("construction_year"),
  description: text("description"),

  // Amenities
  hasGarden: boolean("has_garden"),
  hasBalcony: boolean("has_balcony"),
  hasRoofTerrace: boolean("has_roof_terrace"),

  // Location
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),

  // Media
  photos: jsonb("photos").$type<string[]>().notNull().default([]),

  // Funda status & lifecycle
  status: text("status").notNull().default("Beschikbaar"),
  offeredSince: text("offered_since"),
  disappearedAt: timestamp("disappeared_at", { withTimezone: true }),

  // Pre-computed cycling routes
  routeFareharbor: jsonb("route_fareharbor").$type<RouteResult>(),
  routeAirwallex: jsonb("route_airwallex").$type<RouteResult>(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Listing = InferSelectModel<typeof listings>;
export type NewListing = InferInsertModel<typeof listings>;
