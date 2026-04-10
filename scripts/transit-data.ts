import path from "path";
import {
  AMSTERDAM_CENTRAAL,
  TRANSIT_RADIUS_KM,
  distanceKm,
  formatBoundingBox,
  getTransitBoundingBox,
  isWithinTransitRadius,
} from "./transit-config";

export type StopType = "tram" | "metro" | "train" | "ferry";

export interface TransitStop {
  id: number;
  name: string;
  lat: number;
  lon: number;
  type: StopType;
}

interface TransitData {
  stations: TransitStop[];
  lines: GeoJSON.FeatureCollection;
}

interface TransitStopCandidate {
  stop: TransitStop;
  elementType: string;
}

const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const OVERPASS_TIMEOUT_SECONDS = 180;
const OVERPASS_USER_AGENT = "ernest-transit-fetcher/1.0 (+https://ernest.vhtm.eu)";
const TRANSIT_BOUNDS = getTransitBoundingBox();
const TRANSIT_BBOX = formatBoundingBox(TRANSIT_BOUNDS);
const OUTPUT_DIR = path.resolve(import.meta.dir, "../packages/backend/data");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTransitData(): Promise<TransitData> {
  console.log(
    `Fetching transit around ${AMSTERDAM_CENTRAAL.name} (~${TRANSIT_RADIUS_KM}km, bbox ${TRANSIT_BBOX})...`,
  );

  const stations = await fetchTransitStops();
  await sleep(1500);

  const trainLines = await fetchTrainLines();
  await sleep(1500);

  const metroLines = await fetchRouteLines("subway", "metro", "#E4003A", "Metro");
  await sleep(1500);

  const tramLines = await fetchRouteLines("tram", "tram", "#7B2D8E", "Tram");

  const lines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [...trainLines, ...metroLines, ...tramLines],
  };

  console.log(
    `Transit summary: ${stations.length} stations, ${trainLines.length} train ways, ${metroLines.length} metro routes, ${tramLines.length} tram routes`,
  );

  return { stations, lines };
}

export async function writeTransitData(
  outputDir: string = OUTPUT_DIR,
  transitData: TransitData,
): Promise<void> {
  const stationsPath = path.join(outputDir, "stations.json");
  const linesPath = path.join(outputDir, "lines.geojson");

  const existingFerryStations = await readExistingFerryStations(stationsPath);
  const existingFerryLines = await readExistingFerryLines(linesPath);

  const mergedStations = [...transitData.stations, ...existingFerryStations];
  const mergedLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [...transitData.lines.features, ...existingFerryLines],
  };

  await Promise.all([
    Bun.write(stationsPath, JSON.stringify(mergedStations, null, 2)),
    Bun.write(linesPath, JSON.stringify(mergedLines, null, 2)),
  ]);

  console.log(`Transit data written to ${outputDir}/`);
  console.log(
    `  - stations.json (${transitData.stations.length} transit + ${existingFerryStations.length} preserved ferry)`,
  );
  console.log(
    `  - lines.geojson (${transitData.lines.features.length} transit + ${existingFerryLines.length} preserved ferry)`,
  );
}

async function fetchTransitStops(): Promise<TransitStop[]> {
  console.log("Fetching transit stops from Overpass...");

  const query = `
[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
  nwr["railway"="tram_stop"](${TRANSIT_BBOX});
  nwr["railway"="station"](${TRANSIT_BBOX});
  nwr["railway"="halt"](${TRANSIT_BBOX});
  nwr["station"="subway"](${TRANSIT_BBOX});
);
out center;
`;

  const elements = await runOverpassQuery(query, "transit stops");
  console.log(`  Got ${elements.length} raw OSM elements`);

  const candidates: TransitStopCandidate[] = [];

  for (const element of elements) {
    const tags = getTags(element);
    const coords = getElementCoordinates(element);
    const name = getString(tags.name);
    const type = classifyStop(tags);

    if (!coords || !name || !type) continue;
    if (!isWithinTransitRadius(coords.lat, coords.lon)) continue;

    candidates.push({
      stop: {
        id: typeof element.id === "number" ? element.id : 0,
        name,
        lat: coords.lat,
        lon: coords.lon,
        type,
      },
      elementType: typeof element.type === "string" ? element.type : "node",
    });
  }

  console.log(`  Classified ${candidates.length} in-radius named stops`);

  const grouped = new Map<string, TransitStopCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.stop.name}|${candidate.stop.type}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  const deduplicated: TransitStop[] = [];
  for (const group of grouped.values()) {
    const preferred = pickPreferredStop(group);
    if (preferred) deduplicated.push(preferred.stop);
  }

  deduplicated.sort((a, b) => {
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    return a.name.localeCompare(b.name);
  });

  console.log(`  After deduplication: ${deduplicated.length} unique stops`);
  return deduplicated;
}

async function fetchTrainLines(): Promise<GeoJSON.Feature[]> {
  console.log("Fetching train lines from Overpass...");

  const tiles = splitBoundingBox(TRANSIT_BOUNDS, 4, 4);
  const seenWayIds = new Set<number>();
  const features: GeoJSON.Feature[] = [];

  for (const [index, tile] of tiles.entries()) {
    const tileBbox = formatBoundingBox(tile);
    console.log(`  Tile ${index + 1}/${tiles.length} (${tileBbox})...`);

    const query = `
[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
  way["railway"="rail"]["service"!~"yard|siding|spur|crossover"](${tileBbox});
);
out geom;
`;

    const elements = await runOverpassQuery(query, `train lines tile ${index + 1}/${tiles.length}`);

    for (const element of elements) {
      if (
        element.type !== "way" ||
        typeof element.id !== "number" ||
        seenWayIds.has(element.id) ||
        !Array.isArray(element.geometry) ||
        element.geometry.length < 2
      ) {
        continue;
      }

      const coordinates = element.geometry
        .map((point) => pointToCoordinates(point))
        .filter((point) => point !== null);

      if (coordinates.length < 2) continue;

      seenWayIds.add(element.id);
      const tags = getTags(element);
      const name = getString(tags.name) ?? getString(tags.ref) ?? `Rail ${String(element.id)}`;

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          name,
          colour: "#003DA5",
          lineType: "train",
        },
      });
    }

    if (index < tiles.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`  Got ${features.length} train line features`);
  return features;
}

async function fetchRouteLines(
  route: string,
  lineType: "metro" | "tram",
  defaultColor: string,
  label: string,
): Promise<GeoJSON.Feature[]> {
  console.log(`Fetching ${lineType} routes from Overpass...`);

  const query = `
[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
  relation["route"="${route}"](${TRANSIT_BBOX});
);
out geom;
`;

  const elements = await runOverpassQuery(query, `${lineType} routes`);
  const features: GeoJSON.Feature[] = [];

  for (const element of elements) {
    if (element.type !== "relation" || !Array.isArray(element.members)) continue;

    const coordinates = extractRelationLineCoordinates(element.members);
    if (coordinates.length === 0) continue;

    const tags = getTags(element);
    const ref = getString(tags.ref);
    const relationName = getString(tags.name);
    const name = relationName ?? (ref ? `${label} ${ref}` : label);
    const colour = getString(tags.colour) ?? defaultColor;

    features.push({
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates,
      },
      properties: {
        name,
        colour,
        lineType,
      },
    });
  }

  console.log(`  Got ${features.length} ${lineType} route features`);
  return features;
}

async function runOverpassQuery(query: string, label: string): Promise<any[]> {
  for (const waitMs of [0, 5000, 15000]) {
    if (waitMs > 0) {
      console.log(`  Retrying ${label} after ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }

    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (response.status === 429 || response.status >= 500) {
      console.warn(
        `  Overpass temporary failure while fetching ${label} (${response.status}), will retry`,
      );
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Overpass API error while fetching ${label}: ${response.status} ${await response.text()}`,
      );
    }

    const data = await response.json();
    if (!isRecord(data) || !Array.isArray(data.elements)) return [];
    return data.elements;
  }

  throw new Error(`Overpass API kept failing while fetching ${label}`);
}

function classifyStop(tags: Record<string, unknown>): StopType | null {
  const station = getString(tags.station);
  const railway = getString(tags.railway);

  if (station === "subway") return "metro";
  if (railway === "tram_stop") return "tram";
  if (railway === "station" || railway === "halt") return "train";
  return null;
}

function getTags(element: Record<string, unknown>): Record<string, unknown> {
  const tags = element.tags;
  return isRecord(tags) ? tags : {};
}

function getElementCoordinates(
  element: Record<string, unknown>,
): { lat: number; lon: number } | null {
  const elementType = getString(element.type);
  if (elementType === "node") {
    const lat = typeof element.lat === "number" ? element.lat : null;
    const lon = typeof element.lon === "number" ? element.lon : null;
    if (lat === null || lon === null) return null;
    return { lat, lon };
  }

  const center = element.center;
  if (!isRecord(center)) return null;

  const lat = typeof center.lat === "number" ? center.lat : null;
  const lon = typeof center.lon === "number" ? center.lon : null;
  if (lat === null || lon === null) return null;

  return { lat, lon };
}

function extractRelationLineCoordinates(members: unknown[]): number[][][] {
  const coordinates: number[][][] = [];

  for (const member of members) {
    if (!isRecord(member)) continue;
    if (getString(member.type) !== "way" || !Array.isArray(member.geometry)) continue;

    const line = member.geometry
      .map((point) => pointToCoordinates(point))
      .filter((point) => point !== null);

    if (line.length >= 2) {
      coordinates.push(line);
    }
  }

  return coordinates;
}

function pointToCoordinates(point: unknown): [number, number] | null {
  if (!isRecord(point)) return null;
  const lat = typeof point.lat === "number" ? point.lat : null;
  const lon = typeof point.lon === "number" ? point.lon : null;
  if (lat === null || lon === null) return null;
  return [lon, lat];
}

function splitBoundingBox(
  bounds: { south: number; west: number; north: number; east: number },
  rows: number,
  cols: number,
): Array<{ south: number; west: number; north: number; east: number }> {
  const tiles: Array<{ south: number; west: number; north: number; east: number }> = [];
  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const south = bounds.south + row * latStep;
      const north = row === rows - 1 ? bounds.north : south + latStep;
      const west = bounds.west + col * lonStep;
      const east = col === cols - 1 ? bounds.east : west + lonStep;
      tiles.push({ south, west, north, east });
    }
  }

  return tiles;
}

function pickPreferredStop(group: TransitStopCandidate[]): TransitStopCandidate | null {
  if (group.length === 0) return null;

  return [...group].sort((a, b) => {
    const rankDiff = elementRank(a.elementType) - elementRank(b.elementType);
    if (rankDiff !== 0) return rankDiff;

    const distanceDiff =
      distanceKm(AMSTERDAM_CENTRAAL.lat, AMSTERDAM_CENTRAAL.lon, a.stop.lat, a.stop.lon) -
      distanceKm(AMSTERDAM_CENTRAAL.lat, AMSTERDAM_CENTRAAL.lon, b.stop.lat, b.stop.lon);

    if (distanceDiff !== 0) return distanceDiff;
    return a.stop.id - b.stop.id;
  })[0];
}

function elementRank(elementType: string): number {
  if (elementType === "relation") return 0;
  if (elementType === "way") return 1;
  return 2;
}

async function readExistingFerryStations(stationsPath: string): Promise<TransitStop[]> {
  const file = Bun.file(stationsPath);
  if (!(await file.exists())) return [];

  const data = await file.json();
  if (!Array.isArray(data)) return [];

  const ferryStops: TransitStop[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    if (getString(item.type) !== "ferry") continue;

    const id = typeof item.id === "number" ? item.id : null;
    const name = getString(item.name);
    const lat = typeof item.lat === "number" ? item.lat : null;
    const lon = typeof item.lon === "number" ? item.lon : null;
    if (id === null || !name || lat === null || lon === null) continue;

    ferryStops.push({ id, name, lat, lon, type: "ferry" });
  }

  return ferryStops;
}

async function readExistingFerryLines(linesPath: string): Promise<GeoJSON.Feature[]> {
  const file = Bun.file(linesPath);
  if (!(await file.exists())) return [];

  const data = await file.json();
  if (!isRecord(data) || !Array.isArray(data.features)) return [];

  const ferryFeatures: GeoJSON.Feature[] = [];
  for (const feature of data.features) {
    if (!isGeoJsonFeature(feature)) continue;
    const properties = isRecord(feature.properties) ? feature.properties : null;
    if (!properties) continue;
    if (getString(properties.lineType) !== "ferry") continue;
    ferryFeatures.push(feature);
  }

  return ferryFeatures;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isGeoJsonFeature(value: unknown): value is GeoJSON.Feature {
  return isRecord(value) && getString(value.type) === "Feature" && isRecord(value.geometry);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
