/**
 * Fetches Amsterdam GVB ferry routes and stops from Overpass and merges
 * them into the existing lines.geojson and stations.json data files.
 */
import path from "path";

const FERRY_COLOR = "#0891B2";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch ferry route lines from Overpass
async function fetchFerryLines(): Promise<GeoJSON.FeatureCollection> {
  console.log("Fetching ferry route lines from Overpass...");

  // Query for GVB ferry routes in Amsterdam area
  const query = `
[out:json][timeout:60];
(
  relation["route"="ferry"](52.3,4.8,52.45,5.0);
);
out geom;
`;

  const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const elements: any[] = data.elements ?? [];
  console.log(`  Got ${elements.length} ferry route relations`);

  const features: GeoJSON.Feature[] = [];

  for (const el of elements) {
    if (el.type !== "relation") continue;
    const tags = el.tags ?? {};
    const name = tags.name ?? tags.ref ?? "Ferry";

    // Extract way geometries from relation members
    const members: any[] = el.members ?? [];
    const wayMembers = members.filter(
      (m: any) => m.type === "way" && m.geometry && m.geometry.length > 0,
    );

    if (wayMembers.length === 0) continue;

    // Build MultiLineString from all way geometries
    const lineCoords: number[][][] = [];
    for (const way of wayMembers) {
      const coords = way.geometry.map((pt: any) => [pt.lon, pt.lat]);
      if (coords.length >= 2) {
        lineCoords.push(coords);
      }
    }

    if (lineCoords.length === 0) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates: lineCoords,
      },
      properties: {
        name,
        colour: FERRY_COLOR,
        lineType: "ferry",
      },
    });

    console.log(`  Route: ${name} (${lineCoords.length} ways)`);
  }

  return { type: "FeatureCollection", features };
}

// Fetch ferry stops from Overpass
async function fetchFerryStops(): Promise<
  Array<{ id: number; name: string; lat: number; lon: number; type: string }>
> {
  console.log("Fetching ferry stops from Overpass...");

  const query = `
[out:json][timeout:60];
(
  nwr["amenity"="ferry_terminal"](52.3,4.8,52.45,5.0);
);
out center;
`;

  const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const elements: any[] = data.elements ?? [];
  console.log(`  Got ${elements.length} raw ferry stop elements`);

  const stops: Array<{ id: number; name: string; lat: number; lon: number; type: string }> = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lon = el.type === "node" ? el.lon : el.center?.lon;
    if (lat == null || lon == null) continue;

    const name = tags.name;
    if (!name) continue;

    stops.push({ id: el.id, name, lat, lon, type: "ferry" });
  }

  // Deduplicate by name
  const groups = new Map<string, (typeof stops)[0][]>();
  for (const stop of stops) {
    const key = stop.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(stop);
  }

  const deduplicated: typeof stops = [];
  for (const [, group] of groups) {
    deduplicated.push(group[0]);
  }

  console.log(`  After deduplication: ${deduplicated.length} unique ferry stops`);
  for (const s of deduplicated) {
    console.log(`    - ${s.name} (${s.lat.toFixed(4)}, ${s.lon.toFixed(4)})`);
  }
  return deduplicated;
}

async function main() {
  const outputDir = path.resolve(import.meta.dir, "../packages/backend/data");

  // Fetch ferry data
  const ferryLines = await fetchFerryLines();
  await sleep(2000); // Rate limit
  const ferryStops = await fetchFerryStops();

  // Merge with existing lines.geojson
  const linesPath = path.join(outputDir, "lines.geojson");
  const linesFile = Bun.file(linesPath);
  if (await linesFile.exists()) {
    const existingLines: GeoJSON.FeatureCollection = await linesFile.json();

    // Remove any existing ferry features
    const nonFerryFeatures = existingLines.features.filter(
      (f) => f.properties?.lineType !== "ferry",
    );

    const merged: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [...nonFerryFeatures, ...ferryLines.features],
    };

    await Bun.write(linesPath, JSON.stringify(merged, null, 2));
    console.log(
      `\nUpdated lines.geojson: ${nonFerryFeatures.length} existing + ${ferryLines.features.length} ferry = ${merged.features.length} total`,
    );
  } else {
    console.warn("lines.geojson not found, writing ferry lines only");
    await Bun.write(linesPath, JSON.stringify(ferryLines, null, 2));
  }

  // Merge with existing stations.json
  const stationsPath = path.join(outputDir, "stations.json");
  const stationsFile = Bun.file(stationsPath);
  if (await stationsFile.exists()) {
    const existingStations: Array<{
      id: number;
      name: string;
      lat: number;
      lon: number;
      type: string;
    }> = await stationsFile.json();

    // Remove any existing ferry stops
    const nonFerryStations = existingStations.filter((s) => s.type !== "ferry");
    const merged = [...nonFerryStations, ...ferryStops];

    await Bun.write(stationsPath, JSON.stringify(merged, null, 2));
    console.log(
      `Updated stations.json: ${nonFerryStations.length} existing + ${ferryStops.length} ferry = ${merged.length} total`,
    );
  } else {
    console.warn("stations.json not found, writing ferry stops only");
    await Bun.write(stationsPath, JSON.stringify(ferryStops, null, 2));
  }

  console.log("\nDone! Ferry data merged into existing data files.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
