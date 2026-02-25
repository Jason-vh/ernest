export const OFFICES = {
  fareharbor: { lat: 52.3599, lon: 4.8912, name: "FareHarbor" },
  airwallex: { lat: 52.37, lon: 4.8878, name: "Airwallex" },
} as const;

// Midpoint between the two offices
export const MAP_CENTER = {
  lat: (OFFICES.fareharbor.lat + OFFICES.airwallex.lat) / 2,
  lon: (OFFICES.fareharbor.lon + OFFICES.airwallex.lon) / 2,
} as const;

export const DEFAULT_ZOOM = 13;

export const COLORS = {
  train: "#003DA5",
  trainCasing: "#002A73",
  metro: "#E4003A",
  metroCasing: "#B8002E",
  tram: "#7B2D8E",
  tramLine: "#7B2D8E",
  zone10: "#22c55e",
  zone20: "#f59e0b",
  zone30: "#ef4444",
  routeFareharbor: "#14b8a6",
  routeFareharborCasing: "#0d7377",
  routeAirwallex: "#818cf8",
  routeAirwallexCasing: "#4338ca",
} as const;
