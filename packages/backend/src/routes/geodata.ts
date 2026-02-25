import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import path from "path";
import { REFRESH_SECRET } from "@/config";
import { db } from "@/db";
import { listings, listingReactions, listingNotes, users, type NewListing } from "@/db/schema";
import { isNull, and, or, eq, sql } from "drizzle-orm";
import { syncListings } from "@/services/listing-sync";
import { setBuurtenData } from "@/services/buurt-matcher";
import type { Listing, ListingNote } from "@ernest/shared";

function safeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const geodata = new Hono();

const dataDir = path.resolve(import.meta.dir, "../../data");

const isochronePath = path.join(dataDir, "isochrone.geojson");
const stationsPath = path.join(dataDir, "stations.json");
const linesPath = path.join(dataDir, "lines.geojson");
const buurtenPath = path.join(dataDir, "buurten.geojson");

let isochroneData: unknown = null;
let stationsData: unknown = null;
let linesData: unknown = null;
let buurtenData: unknown = null;
let fundaCache: Listing[] | null = null;

async function queryFundaListings(): Promise<Listing[]> {
  // Alias for the user who set the reaction
  const reactionUser = users;

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      url: listings.url,
      address: listings.address,
      postcode: listings.postcode,
      neighbourhood: listings.neighbourhood,
      price: listings.price,
      bedrooms: listings.bedrooms,
      livingArea: listings.livingArea,
      energyLabel: listings.energyLabel,
      objectType: listings.objectType,
      constructionYear: listings.constructionYear,
      description: listings.description,
      hasGarden: listings.hasGarden,
      hasBalcony: listings.hasBalcony,
      hasRoofTerrace: listings.hasRoofTerrace,
      latitude: listings.latitude,
      longitude: listings.longitude,
      buurtWozValue: listings.buurtWozValue,
      buurtSafetyRating: listings.buurtSafetyRating,
      buurtCrimesPer1000: listings.buurtCrimesPer1000,
      buurtOwnerOccupiedPct: listings.buurtOwnerOccupiedPct,
      photos: listings.photos,
      status: listings.status,
      offeredSince: listings.offeredSince,
      routeFareharbor: sql<number | null>`(${listings.routeFareharbor}->>'duration')::int`,
      routeAirwallex: sql<number | null>`(${listings.routeAirwallex}->>'duration')::int`,
      aiPositives: listings.aiPositives,
      aiNegatives: listings.aiNegatives,
      aiDescription: listings.aiDescription,
      reaction: listingReactions.reaction,
      reactionBy: reactionUser.username,
    })
    .from(listings)
    .leftJoin(listingReactions, eq(listings.fundaId, listingReactions.fundaId))
    .leftJoin(reactionUser, eq(listingReactions.changedBy, reactionUser.id))
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    );

  // Fetch all notes with usernames in a single query
  const noteRows = await db
    .select({
      fundaId: listingNotes.fundaId,
      userId: listingNotes.userId,
      username: users.username,
      text: listingNotes.text,
      updatedAt: listingNotes.updatedAt,
    })
    .from(listingNotes)
    .innerJoin(users, eq(listingNotes.userId, users.id));

  // Group notes by fundaId
  const notesByFundaId = new Map<string, ListingNote[]>();
  for (const note of noteRows) {
    const arr = notesByFundaId.get(note.fundaId) ?? [];
    arr.push({
      userId: note.userId,
      username: note.username,
      text: note.text,
      updatedAt: note.updatedAt.toISOString(),
    });
    notesByFundaId.set(note.fundaId, arr);
  }

  return rows.map((row) =>
    Object.assign(row, {
      reaction: (row.reaction as Listing["reaction"]) ?? null,
      reactionBy: row.reactionBy ?? null,
      notes: notesByFundaId.get(row.fundaId) ?? [],
    }),
  );
}

export function invalidateFundaCache() {
  fundaCache = null;
}

export async function loadData() {
  const isoFile = Bun.file(isochronePath);
  const staFile = Bun.file(stationsPath);
  const linesFile = Bun.file(linesPath);
  const buurtenFile = Bun.file(buurtenPath);

  if (await isoFile.exists()) {
    isochroneData = await isoFile.json();
  }
  if (await staFile.exists()) {
    stationsData = await staFile.json();
  }
  if (await linesFile.exists()) {
    linesData = await linesFile.json();
  }
  if (await buurtenFile.exists()) {
    buurtenData = await buurtenFile.json();
    setBuurtenData(buurtenData);
  }

  // Pre-populate funda cache so first request is instant
  try {
    fundaCache = await queryFundaListings();
    console.log(`Funda cache populated: ${fundaCache.length} listings`);
  } catch (err) {
    console.warn("Failed to pre-populate funda cache:", err);
  }
}

geodata.get("/isochrone", (c) => {
  if (!isochroneData) {
    return c.json({ error: "Isochrone data not available. Run: bun run fetch-data" }, 503);
  }
  return c.json(isochroneData);
});

geodata.get("/stations", (c) => {
  if (!stationsData) {
    return c.json({ error: "Station data not available. Run: bun run fetch-data" }, 503);
  }
  return c.json(stationsData);
});

geodata.get("/lines", (c) => {
  if (!linesData) {
    return c.json({ error: "Lines data not available. Run: bun run fetch-data" }, 503);
  }
  return c.json(linesData);
});

geodata.get("/buurten", (c) => {
  if (!buurtenData) {
    return c.json({ error: "Buurten data not available. Run: bun run fetch-data" }, 503);
  }
  return c.json(buurtenData);
});

geodata.get("/funda", async (c) => {
  if (!fundaCache) {
    fundaCache = await queryFundaListings();
  }
  return c.json(fundaCache);
});

geodata.post("/internal/refresh-funda", bodyLimit({ maxSize: 10 * 1024 * 1024 }), async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth || !safeCompare(auth, `Bearer ${REFRESH_SECRET}`)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("type" in body) ||
    body.type !== "FeatureCollection" ||
    !("features" in body) ||
    !Array.isArray(body.features)
  ) {
    return c.json({ error: "Expected a GeoJSON FeatureCollection" }, 400);
  }

  const incoming: NewListing[] = [];
  for (const feature of body.features) {
    if (
      typeof feature !== "object" ||
      feature === null ||
      !("properties" in feature) ||
      !("geometry" in feature)
    ) {
      continue;
    }
    const p = feature.properties;
    const geom = feature.geometry;
    if (!p || !geom || geom.type !== "Point" || !Array.isArray(geom.coordinates)) continue;

    const fundaId = p.fundaId;
    if (!fundaId) continue;

    let photos: string[] = [];
    if (typeof p.photos === "string") {
      try {
        photos = JSON.parse(p.photos);
      } catch {
        photos = [];
      }
    } else if (Array.isArray(p.photos)) {
      photos = p.photos;
    }

    incoming.push({
      fundaId: String(fundaId),
      url: p.url || "",
      address: p.address || "",
      postcode: p.postcode || null,
      neighbourhood: p.neighbourhood || null,
      price: Number(p.price) || 0,
      bedrooms: Number(p.bedrooms) || 0,
      livingArea: Number(p.livingArea) || 0,
      energyLabel: p.energyLabel || null,
      objectType: p.objectType || null,
      constructionYear: p.constructionYear ? Number(p.constructionYear) : null,
      description: p.description || null,
      hasGarden: p.hasGarden ?? null,
      hasBalcony: p.hasBalcony ?? null,
      hasRoofTerrace: p.hasRoofTerrace ?? null,
      latitude: geom.coordinates[1],
      longitude: geom.coordinates[0],
      photos,
      status: p.status || "Beschikbaar",
      offeredSince: p.offeredSince || null,
    });
  }

  console.log(
    `Funda refresh: ${incoming.length} listings received from ${body.features.length} features`,
  );

  const stats = await syncListings(incoming);
  console.log(
    `Funda sync: ${stats.upserted} upserted, ${stats.disappeared} disappeared, ${stats.jobsEnqueued} jobs enqueued`,
  );

  // Invalidate cache so next GET /funda picks up fresh data
  invalidateFundaCache();

  return c.json({ ok: true, received: incoming.length, ...stats });
});

export default geodata;
