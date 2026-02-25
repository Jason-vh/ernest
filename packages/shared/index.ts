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
}
