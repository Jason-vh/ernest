import type { TransitStop } from "../types/transit";

export async function fetchIsochrone(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch("/api/isochrone");
  if (!res.ok) throw new Error(`Failed to fetch isochrone: ${res.status}`);
  return res.json();
}

export async function fetchStations(): Promise<TransitStop[]> {
  const res = await fetch("/api/stations");
  if (!res.ok) throw new Error(`Failed to fetch stations: ${res.status}`);
  return res.json();
}

export async function fetchLines(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch("/api/lines");
  if (!res.ok) throw new Error(`Failed to fetch lines: ${res.status}`);
  return res.json();
}

export async function fetchBuurten(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch("/api/buurten");
  if (!res.ok) throw new Error(`Failed to fetch buurten: ${res.status}`);
  return res.json();
}

export async function fetchFunda(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch("/api/funda");
  if (!res.ok) throw new Error(`Failed to fetch funda: ${res.status}`);
  return res.json();
}

export interface CyclingRoute {
  duration: number; // minutes
  geometry: GeoJSON.LineString;
}

export interface CyclingRoutes {
  fareharbor: CyclingRoute | null;
  airwallex: CyclingRoute | null;
}

export async function fetchCyclingRoutes(
  from: { lat: number; lon: number },
  signal?: AbortSignal,
): Promise<CyclingRoutes | null> {
  try {
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from }),
      signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
