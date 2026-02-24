export const OFFICES = {
  fareharbor: { lat: 52.3599, lon: 4.8912, name: "FareHarbor" },
  airwallex: { lat: 52.3700, lon: 4.8878, name: "Airwallex" },
} as const;

// Midpoint between the two offices
export const MAP_CENTER = {
  lat: (OFFICES.fareharbor.lat + OFFICES.airwallex.lat) / 2,
  lon: (OFFICES.fareharbor.lon + OFFICES.airwallex.lon) / 2,
} as const;

export const DEFAULT_ZOOM = 13;
