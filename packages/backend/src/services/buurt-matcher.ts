import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";

export interface BuurtStats {
  buurtWozValue: number | null;
  buurtSafetyRating: number | null;
  buurtCrimesPer1000: number | null;
  buurtOwnerOccupiedPct: number | null;
}

interface BuurtEntry {
  coordinates: number[][][];
  wozValue: number | null;
  safetyRating: number | null;
  crimesPer1000: number | null;
  ownerOccupiedPct: number | null;
}

let cachedEntries: BuurtEntry[] = [];

export function setBuurtenData(geojson: unknown): void {
  if (
    typeof geojson !== "object" ||
    geojson === null ||
    !("type" in geojson) ||
    geojson.type !== "FeatureCollection" ||
    !("features" in geojson) ||
    !Array.isArray(geojson.features)
  ) {
    console.warn("setBuurtenData: invalid GeoJSON, skipping");
    return;
  }

  const entries: BuurtEntry[] = [];
  for (const f of geojson.features) {
    if (typeof f !== "object" || f === null || !("geometry" in f) || !("properties" in f)) {
      continue;
    }
    const geom = f.geometry;
    const props = f.properties;
    if (
      typeof geom !== "object" ||
      geom === null ||
      !("type" in geom) ||
      geom.type !== "Polygon" ||
      !("coordinates" in geom) ||
      !Array.isArray(geom.coordinates)
    ) {
      continue;
    }
    if (typeof props !== "object" || props === null) continue;

    entries.push({
      coordinates: geom.coordinates,
      wozValue: typeof props.wozValue === "number" ? props.wozValue : null,
      safetyRating: typeof props.safetyRating === "number" ? props.safetyRating : null,
      crimesPer1000: typeof props.crimesPer1000 === "number" ? props.crimesPer1000 : null,
      ownerOccupiedPct: typeof props.ownerOccupiedPct === "number" ? props.ownerOccupiedPct : null,
    });
  }

  cachedEntries = entries;
  console.log(`Buurt matcher: loaded ${entries.length} neighbourhood polygons`);
}

export function matchBuurt(lat: number, lng: number): BuurtStats | null {
  if (cachedEntries.length === 0) return null;

  const pt = point([lng, lat]);

  for (const entry of cachedEntries) {
    if (booleanPointInPolygon(pt, polygon(entry.coordinates))) {
      return {
        buurtWozValue: entry.wozValue,
        buurtSafetyRating: entry.safetyRating,
        buurtCrimesPer1000: entry.crimesPer1000,
        buurtOwnerOccupiedPct: entry.ownerOccupiedPct,
      };
    }
  }

  return null;
}
