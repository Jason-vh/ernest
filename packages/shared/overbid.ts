import overbidRates from "./overbid-rates.json";

// Municipal / woonplaats overbid rates sourced from Huizenzoeker market pages.
// Rates are percentages, e.g. 10.07 means +10.07% over asking.
export const OVERBID_RATE_PCT_BY_CITY_SLUG: Record<string, number> = overbidRates;

export function getListingCitySlug(url: string): string | null {
  const match = url.match(/\/koop\/([^/]+)\//);
  const slug = match?.[1];
  if (typeof slug !== "string" || slug.length === 0) return null;
  return slug;
}

export function getOverbidRatePctForUrl(url: string): number | null {
  const slug = getListingCitySlug(url);
  if (slug == null) return null;
  const rate = OVERBID_RATE_PCT_BY_CITY_SLUG[slug];
  if (typeof rate !== "number") return null;
  return rate;
}

export function getEstimatedClosingPrice(price: number, url: string): number | null {
  const ratePct = getOverbidRatePctForUrl(url);
  if (ratePct == null) return null;
  return Math.round(price * (1 + ratePct / 100));
}
