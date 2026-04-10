import { decodePolyline } from "@/utils/polyline";
import type { TransitRoute } from "@ernest/shared";
import { GOOGLE_MAPS_API_KEY } from "@/config";

export type RouteResult = TransitRoute;

export const AMSTERDAM_CENTRAAL = {
  lat: 52.3791283,
  lon: 4.8980833,
};

// LRU cache keyed by rounded coordinates and reference arrival time
const CACHE_MAX = 500;
const cache = new Map<string, RouteResult>();
const r = (n: number) => n.toFixed(4);
const AMSTERDAM_TIMEZONE = "Europe/Amsterdam";

function cacheKey(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  arrivalTimeIso: string,
): string {
  return `${r(from.lat)},${r(from.lon)}-${r(to.lat)},${r(to.lon)}@${arrivalTimeIso}`;
}

function getAmsterdamDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return { year, month, day, weekday: weekdayMap[weekdayShort] ?? 1 };
}

function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(date);
  const offsetText = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function getNextMondayArrivalTimeIso(): string {
  const now = new Date();
  const { year, month, day, weekday } = getAmsterdamDateParts(now);
  const daysUntilNextMonday = (8 - weekday) % 7 || 7;

  const localTargetUtcGuess = new Date(
    Date.UTC(year, month - 1, day + daysUntilNextMonday, 9, 0, 0),
  );
  const offsetMinutes1 = getTimezoneOffsetMinutes(AMSTERDAM_TIMEZONE, localTargetUtcGuess);
  const utcMillis1 = localTargetUtcGuess.getTime() - offsetMinutes1 * 60_000;
  const target1 = new Date(utcMillis1);

  const offsetMinutes2 = getTimezoneOffsetMinutes(AMSTERDAM_TIMEZONE, target1);
  const utcMillis2 = localTargetUtcGuess.getTime() - offsetMinutes2 * 60_000;
  return new Date(utcMillis2).toISOString();
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

export async function fetchGoogleRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  forceRefetch = false,
): Promise<RouteResult | null> {
  const arrivalTimeIso = getNextMondayArrivalTimeIso();
  const key = cacheKey(from, to, arrivalTimeIso);
  if (!forceRefetch) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("GOOGLE_MAPS_API_KEY is not set. Skipping route calculation.");
    return null;
  }

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask":
        "routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.transitLine",
    },
    body: JSON.stringify({
      origin: {
        location: { latLng: { latitude: from.lat, longitude: from.lon } },
      },
      destination: {
        location: { latLng: { latitude: to.lat, longitude: to.lon } },
      },
      travelMode: "TRANSIT",
      computeAlternativeRoutes: false,
      arrivalTime: arrivalTimeIso,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Google Routes API error: ${res.status} ${text}`);
    return null;
  }

  const json = await res.json();
  const data = json != null && typeof json === "object" ? json : {};
  const routes = "routes" in data && Array.isArray(data.routes) ? data.routes : [];
  if (routes.length === 0) {
    console.warn("Google Routes API returned no routes");
    return null;
  }

  const firstRoute = routes[0] != null && typeof routes[0] === "object" ? routes[0] : {};
  const durationStr =
    "duration" in firstRoute && typeof firstRoute.duration === "string"
      ? firstRoute.duration
      : "0s";
  const seconds = parseInt(durationStr.replace("s", ""), 10);
  const duration = Math.round(seconds / 60);

  const polylineObj =
    "polyline" in firstRoute &&
    typeof firstRoute.polyline === "object" &&
    firstRoute.polyline != null
      ? firstRoute.polyline
      : {};
  const encodedPolyline =
    "encodedPolyline" in polylineObj && typeof polylineObj.encodedPolyline === "string"
      ? polylineObj.encodedPolyline
      : undefined;

  if (!encodedPolyline) return null;

  const segments: import("@ernest/shared").TransitSegment[] = [];
  const legs = "legs" in firstRoute && Array.isArray(firstRoute.legs) ? firstRoute.legs : [];
  if (legs.length > 0) {
    const steps = "steps" in legs[0] && Array.isArray(legs[0].steps) ? legs[0].steps : [];
    for (const step of steps) {
      if (typeof step !== "object" || step === null) continue;

      const stepDurationStr = typeof step.staticDuration === "string" ? step.staticDuration : "0s";
      const stepSeconds = parseInt(stepDurationStr.replace("s", ""), 10);
      const stepMins = Math.round(stepSeconds / 60);

      if (step.travelMode === "WALK") {
        if (segments.length > 0 && segments[segments.length - 1].mode === "WALK") {
          segments[segments.length - 1].durationMins += stepMins;
        } else {
          segments.push({ mode: "WALK", durationMins: stepMins });
        }
      } else if (step.travelMode === "TRANSIT") {
        const details = step.transitDetails as any;
        const line = details?.transitLine;
        const vType = line?.vehicle?.type;

        let mode: any = "TRANSIT";
        if (vType === "SUBWAY") mode = "SUBWAY";
        else if (vType === "TRAM") mode = "TRAM";
        else if (vType === "HEAVY_RAIL" || vType === "COMMUTER_TRAIN") mode = "TRAIN";
        else if (vType === "BUS") mode = "BUS";
        else if (vType === "FERRY") mode = "FERRY";

        segments.push({
          mode,
          durationMins: stepMins,
          line: line?.nameShort ?? line?.name,
        });
      }
    }
  }

  // Filter out 0-minute segments that can occur due to rounding small walks
  const filteredSegments = segments.filter((s) => s.durationMins > 0);

  const coordinates = decodePolyline(encodedPolyline);
  const result: RouteResult = {
    duration,
    geometry: { type: "LineString", coordinates },
    segments: filteredSegments,
  };
  cachePut(key, result);
  return result;
}
