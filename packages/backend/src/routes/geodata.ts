import { Hono } from "hono";
import path from "path";

const geodata = new Hono();

const dataDir = path.resolve(import.meta.dir, "../../data");
const volumePath = process.env.VOLUME_PATH || "/data";

const isochronePath = path.join(dataDir, "isochrone.geojson");
const stationsPath = path.join(dataDir, "stations.json");
const linesPath = path.join(dataDir, "lines.geojson");
const buurtenPath = path.join(dataDir, "buurten.geojson");
const bundledFundaPath = path.join(dataDir, "funda.geojson");
const volumeFundaPath = path.join(volumePath, "funda.geojson");

let isochroneData: any = null;
let stationsData: unknown = null;
let linesData: unknown = null;
let buurtenData: unknown = null;
let fundaData: unknown = null;

async function loadData() {
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

  // Funda: prefer volume data (persisted from cron), fall back to bundled
  try {
    const volFile = Bun.file(volumeFundaPath);
    if (await volFile.exists()) {
      fundaData = await volFile.json();
      console.log(
        `Loaded funda data from volume: ${(fundaData as any)?.features?.length ?? 0} listings`,
      );
      return;
    }
  } catch (e) {
    console.warn("Failed to load funda data from volume, falling back to bundled:", e);
  }

  const fundaFile = Bun.file(bundledFundaPath);
  if (await fundaFile.exists()) {
    fundaData = await fundaFile.json();
  }
}

// Load data at startup
loadData();

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

geodata.get("/funda", (c) => {
  if (!fundaData) {
    return c.json({ error: "Funda data not available. Run: bun run fetch-data" }, 503);
  }
  return c.json(fundaData);
});

geodata.post("/internal/refresh-funda", async (c) => {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) {
    return c.json({ error: "REFRESH_SECRET not configured" }, 500);
  }

  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body?.type !== "FeatureCollection" || !Array.isArray(body?.features)) {
    return c.json({ error: "Expected a GeoJSON FeatureCollection" }, 400);
  }

  const received = body.features.length;

  // Update in-memory data (immediately live)
  fundaData = body;
  console.log(`Funda data refreshed: ${received} listings`);

  // Persist to volume
  try {
    await Bun.write(volumeFundaPath, JSON.stringify(body));
    console.log(`Funda data persisted to ${volumeFundaPath}`);
  } catch (e) {
    console.warn("Failed to persist funda data to volume:", e);
  }

  return c.json({ ok: true, received });
});

export default geodata;
