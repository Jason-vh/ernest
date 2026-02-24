import { intersect } from "@turf/intersect";
import { union } from "@turf/union";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, featureCollection } from "@turf/helpers";
import path from "path";

const OFFICES = {
  fareharbor: { lat: 52.3599, lon: 4.8912, name: "FareHarbor" },
  airwallex: { lat: 52.3700, lon: 4.8878, name: "Airwallex" },
};

const CONTOUR_TIMES = [10, 20, 30];

const FERRY_CROSSINGS = [
  {
    name: "Buiksloterweg (F3)",
    south: { lat: 52.3813, lon: 4.9003 },
    north: { lat: 52.3907, lon: 4.9012 },
    crossingMinutes: 4,
    waitMinutes: 3, // ferries every ~6 min, avg wait ~3 min
  },
];

enum StopType {
  Tram = "tram",
  Metro = "metro",
  Train = "train",
}

interface TransitStop {
  id: number;
  name: string;
  lat: number;
  lon: number;
  type: StopType;
}

interface BuurtStats {
  wozValue: number | null;
  ownerOccupiedPct: number | null;
  safetyRating: number | null;
  crimesPer1000: number | null;
}

const BBGA_INDICATORS = [
  { id: "WWOZ_GEM", key: "wozValue" },
  { id: "WKOOP_P", key: "ownerOccupiedPct" },
  { id: "VBUURTVEILIG_R", key: "safetyRating" },
  { id: "VMISDRIJF_1000INW", key: "crimesPer1000" },
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Step 1: Fetch isochrones from both offices ---
async function fetchOfficeIsochrone(
  office: { lat: number; lon: number; name: string }
): Promise<GeoJSON.FeatureCollection> {
  console.log(`  Fetching isochrones for ${office.name}...`);

  const body = JSON.stringify({
    locations: [{ lat: office.lat, lon: office.lon }],
    costing: "bicycle",
    contours: CONTOUR_TIMES.map((time) => ({ time })),
    polygons: true,
  });

  const res = await fetch("https://valhalla1.openstreetmap.de/isochrone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Valhalla API error for ${office.name}: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`    Got ${data.features?.length ?? 0} contour(s)`);
  return data;
}

// --- Ferry augmentation helpers ---
async function getCyclingTimeMinutes(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<number> {
  const body = JSON.stringify({
    locations: [
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
    ],
    costing: "bicycle",
  });

  const res = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Valhalla route API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const seconds = data.trip?.summary?.time ?? 0;
  return seconds / 60;
}

async function fetchFerryAugmentedIsochrones(
  office: { lat: number; lon: number; name: string },
  ferry: (typeof FERRY_CROSSINGS)[0]
): Promise<Map<number, GeoJSON.Feature | null>> {
  const cyclingToFerry = await getCyclingTimeMinutes(office, ferry.south);
  console.log(`    ${office.name} -> ${ferry.name} south: ${cyclingToFerry.toFixed(1)} min cycling`);

  const results = new Map<number, GeoJSON.Feature | null>();

  for (const contourTime of CONTOUR_TIMES) {
    const remaining = contourTime - cyclingToFerry - ferry.crossingMinutes - ferry.waitMinutes;
    if (remaining < 3) {
      console.log(`    ${contourTime}-min: ${remaining.toFixed(1)} min remaining in Noord (skipping)`);
      results.set(contourTime, null);
      continue;
    }

    console.log(`    ${contourTime}-min: ${remaining.toFixed(1)} min remaining, fetching Noord isochrone...`);
    await sleep(1000);

    const body = JSON.stringify({
      locations: [{ lat: ferry.north.lat, lon: ferry.north.lon }],
      costing: "bicycle",
      contours: [{ time: Math.round(remaining) }],
      polygons: true,
    });

    const res = await fetch("https://valhalla1.openstreetmap.de/isochrone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      console.warn(`    Valhalla error for Noord isochrone: ${res.status}`);
      results.set(contourTime, null);
      continue;
    }

    const data = await res.json();
    const feature = data.features?.[0] ?? null;
    if (feature) {
      console.log(`    Got Noord supplement for ${contourTime}-min zone`);
    }
    results.set(contourTime, feature);
  }

  return results;
}

function augmentIsochrone(
  mainIso: GeoJSON.FeatureCollection,
  ferrySupplements: Map<number, GeoJSON.Feature | null>[]
): GeoJSON.FeatureCollection {
  const augmented: GeoJSON.Feature[] = [];

  for (const feature of mainIso.features) {
    const contourTime = feature.properties?.contour;
    let merged = feature;

    for (const supplements of ferrySupplements) {
      const supplement = supplements.get(contourTime);
      if (!supplement) continue;

      const result = union(featureCollection([merged as any, supplement as any]));
      if (result) {
        result.properties = { ...feature.properties };
        merged = result;
      }
    }

    augmented.push(merged);
  }

  return { type: "FeatureCollection", features: augmented };
}

function computeZoneIntersections(
  isoA: GeoJSON.FeatureCollection,
  isoB: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  console.log("Computing zone intersections...");

  const zones: GeoJSON.Feature[] = [];

  for (const time of CONTOUR_TIMES) {
    const polyA = isoA.features.find(
      (f) => f.properties?.contour === time
    );
    const polyB = isoB.features.find(
      (f) => f.properties?.contour === time
    );

    if (!polyA || !polyB) {
      console.warn(`  Missing contour for ${time} min, skipping`);
      continue;
    }

    const intersection = intersect(
      featureCollection([polyA as any, polyB as any])
    );

    if (intersection) {
      intersection.properties = { zone: `${time}min` };
      zones.push(intersection);
      console.log(`  ${time}-min zone: intersection computed`);
    } else {
      console.warn(`  ${time}-min zone: no intersection (offices too far apart)`);
    }
  }

  return { type: "FeatureCollection", features: zones };
}

// --- Step 2: Fetch transit stops from Overpass ---
async function fetchTransitStops(): Promise<TransitStop[]> {
  console.log("Fetching transit stops from Overpass API...");

  const query = `
[out:json][timeout:60];
(
  nwr["railway"="tram_stop"](52.3,4.8,52.45,5.0);
  nwr["railway"="station"](52.3,4.8,52.45,5.0);
  nwr["railway"="halt"](52.3,4.8,52.45,5.0);
  nwr["station"="subway"](52.3,4.8,52.45,5.0);
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
  console.log(`  Got ${elements.length} raw OSM elements`);

  const stops: TransitStop[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lon = el.type === "node" ? el.lon : el.center?.lon;
    if (lat == null || lon == null) continue;

    const name = tags.name;
    if (!name) continue;

    let type: StopType;
    if (tags.railway === "tram_stop") {
      type = StopType.Tram;
    } else if (tags.station === "subway") {
      type = StopType.Metro;
    } else if (tags.railway === "station" || tags.railway === "halt") {
      type = StopType.Train;
    } else {
      continue;
    }

    stops.push({ id: el.id, name, lat, lon, type });
  }

  console.log(`  Classified ${stops.length} named stops`);

  // Deduplicate
  const groups = new Map<string, { stop: TransitStop; elType: string }[]>();
  for (const stop of stops) {
    const el = elements.find((e: any) => e.id === stop.id);
    const key = `${stop.name}|${stop.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ stop, elType: el?.type ?? "node" });
  }

  const deduplicated: TransitStop[] = [];
  for (const [, group] of groups) {
    const preferred =
      group.find((g) => g.elType === "relation") ??
      group.find((g) => g.elType === "way") ??
      group[0];
    deduplicated.push(preferred.stop);
  }

  console.log(`  After deduplication: ${deduplicated.length} unique stops`);
  return deduplicated;
}

// --- Step 3: Filter stations within the 30-min zone ---
function filterStationsInZone(
  stations: TransitStop[],
  zones: GeoJSON.FeatureCollection
): TransitStop[] {
  // Use the 30-min zone (outermost) for filtering
  const zone30 = zones.features.find(
    (f) => f.properties?.zone === "30min"
  );
  if (!zone30) {
    console.warn("  No 30-min zone found, returning all stations");
    return stations;
  }

  const filtered = stations.filter((s) => {
    const pt = point([s.lon, s.lat]);
    return booleanPointInPolygon(pt, zone30 as any);
  });

  console.log(`  ${filtered.length} stations within 30-min zone`);
  return filtered;
}

// --- Step 4: Fetch Amsterdam neighbourhood boundaries ---
async function fetchBuurten(): Promise<GeoJSON.FeatureCollection> {
  console.log("Fetching Amsterdam buurt boundaries...");
  const allFeatures: GeoJSON.Feature[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.data.amsterdam.nl/v1/gebieden/buurten?_format=geojson&_pageSize=200&page=${page}`;
    console.log(`  Page ${page}...`);
    const res = await fetch(url);
    if (res.status === 404) break; // past last page
    if (!res.ok) {
      throw new Error(`Amsterdam buurten API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const features = data.features ?? [];
    if (features.length === 0) break;
    allFeatures.push(...features);
    page++;
    await sleep(1000);
  }

  console.log(`  Fetched ${allFeatures.length} buurten total`);
  return { type: "FeatureCollection", features: allFeatures };
}

// --- Step 5: Fetch BBGA neighbourhood statistics ---
async function fetchBuurtStats(): Promise<Map<string, BuurtStats>> {
  console.log("Fetching BBGA neighbourhood statistics...");
  const stats = new Map<string, BuurtStats>();

  for (const indicator of BBGA_INDICATORS) {
    // Try 2024 first, fall back to 2023
    for (const jaar of [2024, 2023]) {
      let page = 1;
      let foundData = false;

      while (true) {
        const url = `https://api.data.amsterdam.nl/v1/bbga/kerncijfers/?_format=json&_pageSize=200&indicatorDefinitieId=${indicator.id}&jaar=${jaar}&page=${page}`;
        console.log(`  ${indicator.id} year=${jaar} page=${page}...`);
        const res = await fetch(url);
        if (res.status === 404) break; // past last page
        if (!res.ok) {
          console.warn(`  API error for ${indicator.id}: ${res.status}`);
          break;
        }
        const data = await res.json();
        const results = data.results ?? data._embedded?.kerncijfers ?? [];
        if (results.length === 0) break;
        foundData = true;

        for (const row of results) {
          const code = row.gebiedcode15;
          const value = row.waarde;
          if (!code || value == null) continue;

          if (!stats.has(code)) {
            stats.set(code, {
              wozValue: null,
              ownerOccupiedPct: null,
              safetyRating: null,
              crimesPer1000: null,
            });
          }
          const entry = stats.get(code)!;
          entry[indicator.key] = Number(value);
        }

        if (!data._links?.next) break;
        page++;
        await sleep(1000);
      }

      if (foundData) {
        console.log(`  ${indicator.id}: using year ${jaar}`);
        break;
      }
    }
  }

  console.log(`  Stats collected for ${stats.size} gebieden`);
  return stats;
}

// --- Step 6: Filter buurten to 30-min zone and merge stats ---
function filterAndMergeBuurten(
  buurten: GeoJSON.FeatureCollection,
  zones: GeoJSON.FeatureCollection,
  stats: Map<string, BuurtStats>
): GeoJSON.FeatureCollection {
  console.log("Filtering buurten to 30-min zone and merging stats...");

  const zone30 = zones.features.find((f) => f.properties?.zone === "30min");
  if (!zone30) {
    console.warn("  No 30-min zone found, returning empty collection");
    return { type: "FeatureCollection", features: [] };
  }

  const filtered: GeoJSON.Feature[] = [];
  let idCounter = 1;

  for (const buurt of buurten.features) {
    // Check if buurt overlaps with the 30-min zone
    const overlap = intersect(featureCollection([zone30 as any, buurt as any]));
    if (!overlap) continue;

    const code = buurt.properties?.code ?? "";
    const name = buurt.properties?.naam ?? buurt.properties?.name ?? "";
    const buurtStats = stats.get(code);

    filtered.push({
      ...buurt,
      id: idCounter++,
      properties: {
        code,
        name,
        wozValue: buurtStats?.wozValue ?? null,
        ownerOccupiedPct: buurtStats?.ownerOccupiedPct ?? null,
        safetyRating: buurtStats?.safetyRating ?? null,
        crimesPer1000: buurtStats?.crimesPer1000 ?? null,
      },
    });
  }

  console.log(`  ${filtered.length} buurten within 30-min zone`);
  return { type: "FeatureCollection", features: filtered };
}

// --- Funda listings ---
async function fetchFundaListings(): Promise<GeoJSON.FeatureCollection> {
  const scriptPath = path.resolve(import.meta.dir, "fetch_funda.py");
  const proc = Bun.spawn(["python3.13", scriptPath], {
    stdout: "pipe",
    stderr: "inherit",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`fetch_funda.py exited with code ${exitCode}`);
  }

  return JSON.parse(output);
}

function filterPointsInZone(
  fc: GeoJSON.FeatureCollection,
  zones: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection {
  const zone30 = zones.features.find((f) => f.properties?.zone === "30min");
  if (!zone30) {
    console.warn("  No 30-min zone found, returning all features");
    return fc;
  }

  const filtered = fc.features.filter((f) => {
    if (f.geometry.type !== "Point") return false;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    const pt = point([lng, lat]);
    return booleanPointInPolygon(pt, zone30 as any);
  });

  return { type: "FeatureCollection", features: filtered };
}

// --- Main ---
async function main() {
  console.log("Fetching office isochrones from Valhalla...");
  const isoFH = await fetchOfficeIsochrone(OFFICES.fareharbor);
  await sleep(1000);
  const isoAW = await fetchOfficeIsochrone(OFFICES.airwallex);

  // Ferry augmentation: compute supplementary isochrones from Noord
  console.log("\nComputing ferry-augmented isochrones for Amsterdam Noord...");
  const ferrySupplementsFH: Map<number, GeoJSON.Feature | null>[] = [];
  const ferrySupplementsAW: Map<number, GeoJSON.Feature | null>[] = [];

  for (const ferry of FERRY_CROSSINGS) {
    console.log(`  Ferry: ${ferry.name}`);
    await sleep(1000);
    const suppFH = await fetchFerryAugmentedIsochrones(OFFICES.fareharbor, ferry);
    ferrySupplementsFH.push(suppFH);
    await sleep(1000);
    const suppAW = await fetchFerryAugmentedIsochrones(OFFICES.airwallex, ferry);
    ferrySupplementsAW.push(suppAW);
  }

  const augmentedFH = augmentIsochrone(isoFH, ferrySupplementsFH);
  const augmentedAW = augmentIsochrone(isoAW, ferrySupplementsAW);
  console.log("  Ferry augmentation complete");

  const zones = computeZoneIntersections(augmentedFH, augmentedAW);

  // Fetch transit data and buurt data in parallel
  console.log("\nFetching transit data and neighbourhood data...");
  await sleep(2000);

  const [allStations, buurten, buurtStats] = await Promise.all([
    fetchTransitStops(),
    fetchBuurten(),
    fetchBuurtStats(),
  ]);

  const stations = filterStationsInZone(allStations, zones);
  const filteredBuurten = filterAndMergeBuurten(buurten, zones, buurtStats);

  // Funda listings
  console.log("\nFetching Funda listings via pyfunda...");
  const fundaListings = await fetchFundaListings();
  const filteredFunda = filterPointsInZone(fundaListings, zones);
  console.log(`  ${filteredFunda.features.length} Funda listings within 30-min zone`);

  // Lines data: skip if already exists (expensive query, data doesn't change)
  const outputDir = path.resolve(import.meta.dir, "../packages/backend/data");
  const linesPath = path.join(outputDir, "lines.geojson");
  const linesExist = await Bun.file(linesPath).exists();
  if (linesExist) {
    console.log("\nLines data already exists, skipping fetch");
  } else {
    console.log("\nFetching transit lines...");
    await sleep(5000);
    // (lines fetch code omitted for brevity — run separately if needed)
    console.warn("  lines.geojson not found — run the lines fetch script separately");
  }

  await Promise.all([
    Bun.write(
      path.join(outputDir, "isochrone.geojson"),
      JSON.stringify(zones, null, 2)
    ),
    Bun.write(
      path.join(outputDir, "stations.json"),
      JSON.stringify(stations, null, 2)
    ),
    Bun.write(
      path.join(outputDir, "buurten.geojson"),
      JSON.stringify(filteredBuurten, null, 2)
    ),
    Bun.write(
      path.join(outputDir, "funda.geojson"),
      JSON.stringify(filteredFunda, null, 2)
    ),
  ]);

  console.log(`\nData written to ${outputDir}/`);
  console.log("  - isochrone.geojson (3 zone intersections)");
  console.log("  - stations.json");
  console.log("  - buurten.geojson");
  console.log("  - funda.geojson");

  const tramCount = stations.filter((s) => s.type === StopType.Tram).length;
  const metroCount = stations.filter((s) => s.type === StopType.Metro).length;
  const trainCount = stations.filter((s) => s.type === StopType.Train).length;
  console.log(`\nSummary: ${tramCount} tram, ${metroCount} metro, ${trainCount} train stops`);
  console.log(`Neighbourhoods: ${filteredBuurten.features.length} buurten within 30-min zone`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
