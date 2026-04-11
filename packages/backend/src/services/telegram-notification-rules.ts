import type { RouteResult } from "@/services/google-routes";

export const TELEGRAM_NOTIFICATION_MAX_COMMUTE_MINS = 50;

export function isTelegramNotificationEligible(listing: {
  status: string;
  disappearedAt: Date | null;
  routeCentraal: RouteResult | null;
}): boolean {
  if (listing.disappearedAt !== null) return false;
  if (listing.status !== "Beschikbaar" && listing.status !== "") return false;

  const route = listing.routeCentraal;
  if (route === null) return false;

  return route.duration <= TELEGRAM_NOTIFICATION_MAX_COMMUTE_MINS;
}
