import { decodePolyline } from "@/utils/polyline";
import type { CyclingRoute } from "@ernest/shared";

export type RouteResult = CyclingRoute;

export const OFFICES = {
  fareharbor: { lat: 52.3599, lon: 4.8912 },
  airwallex: { lat: 52.37, lon: 4.8878 },
};

// LRU cache keyed by rounded coordinates
const CACHE_MAX = 500;
const cache = new Map<string, RouteResult>();
const r = (n: number) => n.toFixed(4);

function cacheKey(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  return `${r(from.lat)},${r(from.lon)}-${r(to.lat)},${r(to.lon)}`;
}

function cacheGet(key: string): RouteResult | undefined {
  const cached = cache.get(key);
  if (cached) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, cached);
  }
  return cached;
}

function cachePut(key: string, value: RouteResult) {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, value);
}

export async function fetchValhallaRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<RouteResult | null> {
  const key = cacheKey(from, to);
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: [
        { lat: from.lat, lon: from.lon },
        { lat: to.lat, lon: to.lon },
      ],
      costing: "bicycle",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Valhalla error: ${res.status} ${text}`);
    return null;
  }

  const json = await res.json();
  const data = json != null && typeof json === "object" ? json : {};
  const trip =
    "trip" in data && data.trip != null && typeof data.trip === "object" ? data.trip : {};
  const summary =
    "summary" in trip && trip.summary != null && typeof trip.summary === "object"
      ? trip.summary
      : {};
  const seconds = "time" in summary && typeof summary.time === "number" ? summary.time : 0;
  const duration = Math.round(seconds / 60);
  const legs = "legs" in trip && Array.isArray(trip.legs) ? trip.legs : [];
  const firstLeg = legs[0] != null && typeof legs[0] === "object" ? legs[0] : {};
  const shape =
    "shape" in firstLeg && typeof firstLeg.shape === "string" ? firstLeg.shape : undefined;
  if (!shape) return null;

  const coordinates = decodePolyline(shape);
  const result: RouteResult = {
    duration,
    geometry: { type: "LineString", coordinates },
  };
  cachePut(key, result);
  return result;
}
