import { Hono } from "hono";
import { decodePolyline } from "../utils/polyline";

const route = new Hono();

// LRU cache for route responses
const CACHE_MAX = 500;
const cache = new Map<string, { duration: number; geometry: GeoJSON.LineString }>();

function cacheKey(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): string {
  // Round to 4 decimals (~11m precision) for cache hits on nearby points
  const r = (n: number) => n.toFixed(4);
  return `${r(from.lat)},${r(from.lon)}-${r(to.lat)},${r(to.lon)}`;
}

function cachePut(
  key: string,
  value: { duration: number; geometry: GeoJSON.LineString },
) {
  // Evict oldest entry if at capacity
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

route.post("/route", async (c) => {
  let body: { from: { lat: number; lon: number }; to: { lat: number; lon: number } };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.from?.lat || !body.from?.lon || !body.to?.lat || !body.to?.lon) {
    return c.json({ error: "Missing from/to coordinates" }, 400);
  }

  const key = cacheKey(body.from, body.to);
  const cached = cache.get(key);
  if (cached) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, cached);
    return c.json(cached);
  }

  try {
    const valhallaBody = JSON.stringify({
      locations: [
        { lat: body.from.lat, lon: body.from.lon },
        { lat: body.to.lat, lon: body.to.lon },
      ],
      costing: "bicycle",
    });

    const res = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: valhallaBody,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`Valhalla error: ${res.status} ${text}`);
      return c.json({ error: "Routing service error" }, 502);
    }

    const data = await res.json();
    const seconds = data.trip?.summary?.time ?? 0;
    const duration = Math.round(seconds / 60);
    const shape = data.trip?.legs?.[0]?.shape;

    if (!shape) {
      return c.json({ error: "No route shape returned" }, 502);
    }

    const coordinates = decodePolyline(shape);
    const geometry: GeoJSON.LineString = {
      type: "LineString",
      coordinates,
    };

    const result = { duration, geometry };
    cachePut(key, result);
    return c.json(result);
  } catch (err) {
    console.warn("Route fetch failed:", err);
    return c.json({ error: "Routing service unavailable" }, 502);
  }
});

export default route;
