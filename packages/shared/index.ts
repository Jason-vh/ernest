export interface CyclingRoute {
  duration: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface CyclingRoutes {
  fareharbor: CyclingRoute | null;
  airwallex: CyclingRoute | null;
}

export type ReactionType = "favourite" | "discarded";

export interface ListingNote {
  userId: string;
  username: string;
  text: string;
  updatedAt: string;
}

/** The shape returned by GET /api/funda — all listing fields except lifecycle timestamps. */
export interface Listing {
  fundaId: string;
  url: string;
  address: string;
  postcode: string | null;
  neighbourhood: string | null;
  price: number;
  bedrooms: number;
  livingArea: number;
  energyLabel: string | null;
  objectType: string | null;
  constructionYear: number | null;
  description: string | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
  latitude: number;
  longitude: number;
  photos: string[];
  status: string;
  offeredSince: string | null;

  /** Cycling duration (in minutes) */
  routeFareharbor: number | null;
  routeAirwallex: number | null;

  /** AI-generated 1-2 sentence summary */
  aiSummary: string | null;
  /** AI-cleaned English translation of description */
  aiDescription: string | null;

  /** Collaborative reaction (null = unreviewed) */
  reaction: ReactionType | null;
  /** Username of who set the reaction */
  reactionBy: string | null;
  /** Notes from all users */
  notes: ListingNote[];
}
