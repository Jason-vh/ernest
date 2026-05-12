import type { TransitStop } from "@/types/transit";
import type {
  ActivityListing,
  Listing,
  ListingCatchConcern,
  ReactionType,
  UpcomingViewing,
} from "@ernest/shared";

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

export async function fetchFunda(): Promise<Listing[]> {
  const res = await fetch("/api/funda");
  if (!res.ok) throw new Error(`Failed to fetch funda: ${res.status}`);
  return res.json();
}

export async function putReaction(fundaId: string, reaction: ReactionType | null): Promise<void> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/reaction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reaction }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to set reaction: ${res.status}`);
  }
}

export async function putNote(fundaId: string, text: string): Promise<void> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to save note: ${res.status}`);
  }
}

export async function putViewing(
  fundaId: string,
  scheduledAt: string,
  note: string | null,
): Promise<void> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/viewing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ scheduledAt, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to save viewing: ${res.status}`);
  }
}

export async function deleteViewing(fundaId: string): Promise<void> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/viewing`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to cancel viewing: ${res.status}`);
  }
}

export async function fetchActivity(query = ""): Promise<ActivityListing[]> {
  const trimmed = query.trim();
  const url = trimmed === "" ? "/api/activity" : `/api/activity?q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch activity: ${res.status}`);
  return res.json();
}

export async function analyzeCatch(fundaId: string): Promise<ListingCatchConcern[]> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/catch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to analyze listing: ${res.status}`);
  }
  const json = (await res.json()) as { aiCatch: ListingCatchConcern[] };
  return json.aiCatch;
}

export async function translateDescription(fundaId: string): Promise<string> {
  const res = await fetch(`/api/listings/${encodeURIComponent(fundaId)}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to translate listing: ${res.status}`);
  }
  const json = (await res.json()) as { descriptionEn: string };
  return json.descriptionEn;
}

export async function fetchUpcomingViewings(): Promise<UpcomingViewing[]> {
  const res = await fetch("/api/viewings/upcoming");
  if (!res.ok) throw new Error(`Failed to fetch upcoming viewings: ${res.status}`);
  return res.json();
}
