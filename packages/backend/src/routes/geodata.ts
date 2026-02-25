import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import path from "path";
import { REFRESH_SECRET } from "@/config";
import { db } from "@/db";
import { listings, type NewListing } from "@/db/schema";
import { isNull, and, or, eq, sql } from "drizzle-orm";
import { syncListings } from "@/services/listing-sync";
import type { Listing } from "@ernest/shared";

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
      photos: listings.photos,
      status: listings.status,
      offeredSince: listings.offeredSince,
      routeFareharbor: sql<number | null>`(${listings.routeFareharbor}->>'duration')::int`,
      routeAirwallex: sql<number | null>`(${listings.routeAirwallex}->>'duration')::int`,
    })
    .from(listings)
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    );

  return rows;
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
  if (auth !== `Bearer ${REFRESH_SECRET}`) {
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
    `Funda sync: ${stats.upserted} upserted, ${stats.disappeared} disappeared, ${stats.routesComputed} routes computed`,
  );

  // Invalidate cache so next GET /funda picks up fresh data
  fundaCache = null;

  return c.json({ ok: true, received: incoming.length, ...stats });
});

export default geodata;
