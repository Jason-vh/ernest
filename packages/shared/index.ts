export type ListingState = "liked" | "discarded" | "applied" | "viewing";

export interface ListingNote {
  userId: string;
  username: string;
  text: string;
  updatedAt: string;
}

export interface ListingViewingInfo {
  scheduledAt: string;
  note: string | null;
  scheduledBy: string;
  updatedAt: string;
}

export type ListingCatchSeverity = "low" | "medium" | "high";

export interface ListingCatchConcern {
  severity: ListingCatchSeverity;
  flag: string;
}

export interface UpcomingViewing {
  fundaId: string;
  url: string;
  address: string;
  city: string | null;
  price: number;
  photo: string | null;
  scheduledAt: string;
  note: string | null;
  scheduledBy: string;
}

export interface ActivityListing {
  fundaId: string;
  source: string;
  url: string;
  address: string;
  postcode: string | null;
  city: string | null;
  price: number;
  photo: string | null;
  /** When the listing first appeared in our system */
  createdAt: string;
  /** Most recent of: createdAt, stateAt, viewingUpdatedAt — drives feed sort order */
  lastActivityAt: string;
  state: ListingState | null;
  stateBy: string | null;
  stateAt: string | null;
  /** The state-setter's note for this listing, if they wrote one */
  note: string | null;
  viewing: {
    scheduledAt: string;
    by: string;
    at: string;
  } | null;
}

export const SOURCE_LABELS: Record<string, string> = {
  funda: "Funda",
  vesteda: "Vesteda",
  vbt: "VB&T",
  pararius: "Pararius",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** The shape returned by GET /api/funda — all listing fields except lifecycle timestamps. */
export interface Listing {
  fundaId: string;
  source: string;
  url: string;
  address: string;
  postcode: string | null;
  city: string | null;
  neighbourhood: string | null;
  /** Monthly rent in EUR */
  price: number;
  bedrooms: number;
  livingArea: number;
  energyLabel: string | null;
  objectType: string | null;
  constructionYear: number | null;
  description: string | null;
  descriptionEn: string | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
  latitude: number;
  longitude: number;
  buurtSafetyRating: number | null;
  buurtCrimesPer1000: number | null;
  photos: string[];
  status: string;
  offeredSince: string | null;

  /** Collaborative state (null = unreviewed) */
  state: ListingState | null;
  /** Username of who set the state */
  stateBy: string | null;
  /** Notes from all users */
  notes: ListingNote[];
  /** Scheduled viewing details (one per listing, null if none) */
  viewing: ListingViewingInfo | null;
  /** Skeptical AI analysis. null = not analyzed yet. [] = analyzed, no concerns. */
  aiCatch: ListingCatchConcern[] | null;
  /** Detected from photos by AI. null = not yet analyzed. */
  aiHasBathtub: boolean | null;
  /** Detected from photos/data by AI. null = not yet analyzed. */
  aiHasOutsideArea: boolean | null;
  /** All source links for this listing (same property on multiple platforms). */
  sources: { source: string; url: string }[];
}
