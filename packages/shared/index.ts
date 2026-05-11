export interface TransitSegment {
  mode: "WALK" | "SUBWAY" | "TRAM" | "BUS" | "TRAIN" | "FERRY" | "TRANSIT";
  durationMins: number;
  line?: string;
}

export interface TransitRoute {
  duration: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  segments: TransitSegment[];
}

export interface TransitRoutes {
  centraal: TransitRoute | null;
}

export type ReactionType = "favourite" | "discarded";

export {
  OVERBID_RATE_PCT_BY_CITY_SLUG,
  getEstimatedClosingPrice,
  getListingCitySlug,
  getOverbidRatePctForUrl,
} from "./overbid";

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
  url: string;
  address: string;
  postcode: string | null;
  city: string | null;
  price: number;
  photo: string | null;
  /** When the listing first appeared in our system */
  createdAt: string;
  /** Most recent of: createdAt, reaction.at, viewing.at — drives feed sort order */
  lastActivityAt: string;
  reaction: {
    type: ReactionType;
    by: string;
    at: string;
    /** The reactor's note for this listing, if they wrote one */
    note: string | null;
  } | null;
  viewing: {
    scheduledAt: string;
    by: string;
    at: string;
  } | null;
}

/** The shape returned by GET /api/funda — all listing fields except lifecycle timestamps. */
export interface Listing {
  fundaId: string;
  url: string;
  address: string;
  postcode: string | null;
  city: string | null;
  neighbourhood: string | null;
  price: number;
  bedrooms: number;
  livingArea: number;
  energyLabel: string | null;
  objectType: string | null;
  constructionYear: number | null;
  description: string | null;
  descriptionEn: string | null;
  ownership: string | null;
  vveCostsMonthly: number | null;
  erfpachtCostsMonthly: number | null;
  wozValue: number | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
  latitude: number;
  longitude: number;
  buurtWozValue: number | null;
  buurtSafetyRating: number | null;
  buurtCrimesPer1000: number | null;
  buurtOwnerOccupiedPct: number | null;
  photos: string[];
  status: string;
  offeredSince: string | null;

  /** Public transit route to Amsterdam Centraal */
  routeCentraal: TransitRoute | null;

  /** Collaborative reaction (null = unreviewed) */
  reaction: ReactionType | null;
  /** Username of who set the reaction */
  reactionBy: string | null;
  /** Notes from all users */
  notes: ListingNote[];
  /** Scheduled viewing (one per listing, null if none) */
  viewing: ListingViewingInfo | null;
  /** Skeptical AI analysis. null = not analyzed yet. [] = analyzed, no concerns. */
  aiCatch: ListingCatchConcern[] | null;
}
