import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import path from "path";
import { REFRESH_SECRET } from "../config";
import { db } from "../db";
import { listings, type NewListing } from "../db/schema";
import { isNull, and, or, eq } from "drizzle-orm";
import { syncListings } from "../services/listing-sync";

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
  const rows = await db
    .select()
    .from(listings)
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    );

  const features = rows.map((row) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [row.longitude, row.latitude],
    },
    properties: {
      fundaId: row.fundaId,
      price: row.price,
      address: row.address,
      bedrooms: row.bedrooms,
      livingArea: row.livingArea,
      photo: Array.isArray(row.photos) && row.photos.length > 0 ? row.photos[0] : "",
      photos: JSON.stringify(row.photos),
      url: row.url,
      routeFareharbor: row.routeFareharbor ? JSON.stringify(row.routeFareharbor) : null,
      routeAirwallex: row.routeAirwallex ? JSON.stringify(row.routeAirwallex) : null,
    },
  }));

  return c.json({ type: "FeatureCollection", features });
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

  return c.json({ ok: true, received: incoming.length, ...stats });
});

export default geodata;
