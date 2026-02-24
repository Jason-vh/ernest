import { Hono } from "hono";
import { decodePolyline } from "../utils/polyline";

const route = new Hono();

interface RouteResult {
  duration: number;
  geometry: GeoJSON.LineString;
}

const OFFICES = {
  fareharbor: { lat: 52.3599, lon: 4.8912 },
  airwallex: { lat: 52.3700, lon: 4.8878 },
};

// LRU cache keyed by rounded coordinates
const CACHE_MAX = 500;
const cache = new Map<string, RouteResult>();

function cacheKey(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): string {
  const r = (n: number) => n.toFixed(4);
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
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

async function fetchValhallaRoute(
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

  const data = await res.json();
  const seconds = data.trip?.summary?.time ?? 0;
  const duration = Math.round(seconds / 60);
  const shape = data.trip?.legs?.[0]?.shape;
  if (!shape) return null;

  const coordinates = decodePolyline(shape);
  const result: RouteResult = {
    duration,
    geometry: { type: "LineString", coordinates },
  };
  cachePut(key, result);
  return result;
}

// Batch endpoint: fetches routes from a point to both offices sequentially
route.post("/routes", async (c) => {
  let body: { from: { lat: number; lon: number } };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.from?.lat || !body.from?.lon) {
    return c.json({ error: "Missing from coordinates" }, 400);
  }

  try {
    // Sequential to avoid Valhalla rate limiting
    const fareharbor = await fetchValhallaRoute(body.from, OFFICES.fareharbor);
    const airwallex = await fetchValhallaRoute(body.from, OFFICES.airwallex);

    return c.json({ fareharbor, airwallex });
  } catch (err) {
    console.warn("Route fetch failed:", err);
    return c.json({ error: "Routing service unavailable" }, 502);
  }
});

export default route;
