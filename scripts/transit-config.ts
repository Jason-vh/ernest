export const AMSTERDAM_CENTRAAL = {
  lat: 52.3791283,
  lon: 4.8980833,
  name: "Amsterdam Centraal",
} as const;

export const TRANSIT_RADIUS_KM = 40;

const KM_PER_LAT_DEGREE = 110.574;
const KM_PER_LON_DEGREE_AT_EQUATOR = 111.32;
const EARTH_RADIUS_KM = 6371;

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function getTransitBoundingBox(): BoundingBox {
  const latDelta = TRANSIT_RADIUS_KM / KM_PER_LAT_DEGREE;
  const lonDelta =
    TRANSIT_RADIUS_KM /
    (KM_PER_LON_DEGREE_AT_EQUATOR * Math.cos((AMSTERDAM_CENTRAAL.lat * Math.PI) / 180));

  return {
    south: AMSTERDAM_CENTRAAL.lat - latDelta,
    west: AMSTERDAM_CENTRAAL.lon - lonDelta,
    north: AMSTERDAM_CENTRAAL.lat + latDelta,
    east: AMSTERDAM_CENTRAAL.lon + lonDelta,
  };
}

export function formatBoundingBox(bounds: BoundingBox): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east]
    .map((value) => value.toFixed(6))
    .join(",");
}

export function distanceKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);
  const startLat = toRadians(latA);
  const endLat = toRadians(latB);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinTransitRadius(lat: number, lon: number): boolean {
  return distanceKm(AMSTERDAM_CENTRAAL.lat, AMSTERDAM_CENTRAAL.lon, lat, lon) <= TRANSIT_RADIUS_KM;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
