import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual, createHash } from "node:crypto";
import path from "path";
import { REFRESH_SECRET } from "@/config";
import { db } from "@/db";
import {
  listings,
  listingReactions,
  listingNotes,
  listingViewings,
  users,
  type NewListing,
} from "@/db/schema";
import { isNull, and, or, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { syncListings } from "@/services/listing-sync";
import { setBuurtenData } from "@/services/buurt-matcher";
import type { Listing, ListingNote } from "@ernest/shared";

function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const geodata = new Hono();

const dataDir = path.resolve(import.meta.dir, "../../data");

const stationsPath = path.join(dataDir, "stations.json");
const linesPath = path.join(dataDir, "lines.geojson");
const buurtenPath = path.join(dataDir, "buurten.geojson");

let stationsData: unknown = null;
let linesData: unknown = null;
let buurtenData: unknown = null;
let fundaCacheJson: string | null = null;
let rebuildPromise: Promise<number> | null = null;

async function rebuildFundaCache(): Promise<number> {
  const data = await queryFundaListings();
  fundaCacheJson = JSON.stringify(data);
  return data.length;
}

function triggerRebuild(): Promise<number> {
  if (!rebuildPromise) {
    rebuildPromise = rebuildFundaCache().finally(() => {
      rebuildPromise = null;
    });
  }
  return rebuildPromise;
}

async function ensureFundaCache(): Promise<void> {
  if (fundaCacheJson) return;
  await triggerRebuild();
}

async function queryFundaListings(): Promise<Listing[]> {
  // Aliases so we can join users twice (reaction + viewing scheduler)
  const reactionUser = alias(users, "reaction_user");
  const viewingUser = alias(users, "viewing_user");

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      url: listings.url,
      address: listings.address,
      postcode: listings.postcode,
      city: listings.city,
      neighbourhood: listings.neighbourhood,
      price: listings.price,
      bedrooms: listings.bedrooms,
      livingArea: listings.livingArea,
      energyLabel: listings.energyLabel,
      objectType: listings.objectType,
      houseType: listings.houseType,
      constructionYear: listings.constructionYear,
      description: listings.description,
      descriptionEn: listings.descriptionEn,
      hasGarden: listings.hasGarden,
      hasBalcony: listings.hasBalcony,
      hasRoofTerrace: listings.hasRoofTerrace,
      latitude: listings.latitude,
      longitude: listings.longitude,
      buurtSafetyRating: listings.buurtSafetyRating,
      buurtCrimesPer1000: listings.buurtCrimesPer1000,
      photos: listings.photos,
      status: listings.status,
      offeredSince: listings.offeredSince,
      aiCatch: listings.aiCatch,
      reaction: listingReactions.reaction,
      reactionBy: reactionUser.username,
      viewingScheduledAt: listingViewings.scheduledAt,
      viewingNote: listingViewings.note,
      viewingBy: viewingUser.username,
      viewingUpdatedAt: listingViewings.updatedAt,
    })
    .from(listings)
    .leftJoin(listingReactions, eq(listings.fundaId, listingReactions.fundaId))
    .leftJoin(reactionUser, eq(listingReactions.changedBy, reactionUser.id))
    .leftJoin(listingViewings, eq(listings.fundaId, listingViewings.fundaId))
    .leftJoin(viewingUser, eq(listingViewings.scheduledBy, viewingUser.id))
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

  return rows.map((row) => {
    const { viewingScheduledAt, viewingNote, viewingBy, viewingUpdatedAt, ...rest } = row;
    const viewing: Listing["viewing"] =
      viewingScheduledAt && viewingBy
        ? {
            scheduledAt: viewingScheduledAt.toISOString(),
            note: viewingNote ?? null,
            scheduledBy: viewingBy,
            updatedAt: (viewingUpdatedAt ?? viewingScheduledAt).toISOString(),
          }
        : null;
    return Object.assign(rest, {
      reaction: (rest.reaction as Listing["reaction"]) ?? null,
      reactionBy: rest.reactionBy ?? null,
      notes: notesByFundaId.get(rest.fundaId) ?? [],
      viewing,
    });
  });
}

export async function invalidateFundaCache() {
  // Wait for any in-flight rebuild, then force a fresh one
  if (rebuildPromise) await rebuildPromise.catch(() => {});
  fundaCacheJson = null;
  await triggerRebuild();
}

export async function loadData() {
  const staFile = Bun.file(stationsPath);
  const linesFile = Bun.file(linesPath);
  const buurtenFile = Bun.file(buurtenPath);
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
    const count = await rebuildFundaCache();
    console.log(`Funda cache populated: ${count} listings`);
  } catch (err) {
    console.warn("Failed to pre-populate funda cache:", err);
  }
}

// /isochrone endpoint removed

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
  await ensureFundaCache();
  const json = fundaCacheJson ?? "[]";
  return c.body(json, 200, { "Content-Type": "application/json" });
});

geodata.get("/internal/known-listings", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth || !safeCompare(auth, `Bearer ${REFRESH_SECRET}`)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const rows = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    );

  return c.json(rows.map((r) => r.fundaId));
});

geodata.post(
  "/internal/refresh-funda",
  bodyLimit({
    maxSize: 25 * 1024 * 1024,
    onError: (c) => c.json({ error: "Refresh payload too large" }, 413),
  }),
  async (c) => {
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

    const limitParam = c.req.query("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 0;

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

    let features = body.features;
    if (limit > 0) {
      features = features.slice(0, limit);
    }

    const incoming: NewListing[] = [];
    for (const feature of features) {
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
        city: p.city || null,
        neighbourhood: p.neighbourhood || null,
        price: Number(p.price) || 0,
        bedrooms: Number(p.bedrooms) || 0,
        livingArea: Number(p.livingArea) || 0,
        energyLabel: p.energyLabel || null,
        objectType: p.objectType || null,
        houseType: p.houseType || null,
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

    // Rebuild cache immediately so next GET /funda is instant
    await invalidateFundaCache();

    return c.json({ ok: true, received: incoming.length, ...stats });
  },
);

export default geodata;
