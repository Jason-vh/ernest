import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { fetchGoogleRoute, OFFICES } from "@/services/google-routes";

export async function handleComputeRoutes(job: Job): Promise<"completed" | "skipped"> {
  // Fetch listing coords
  const rows = await db
    .select({
      fundaId: listings.fundaId,
      latitude: listings.latitude,
      longitude: listings.longitude,
      routeFareharbor: listings.routeFareharbor,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  // Already has routes
  if (listing.routeFareharbor !== null) return "skipped";

  const from = { lat: listing.latitude, lon: listing.longitude };
  const fareharbor = await fetchGoogleRoute(from, OFFICES.fareharbor, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const airwallex = await fetchGoogleRoute(from, OFFICES.airwallex, true);

  // If both routes are null (Google API down or missing key), throw so the job retries with backoff
  if (fareharbor === null && airwallex === null) {
    throw new Error("Google Routes API unreachable: both route requests returned null");
  }

  await db
    .update(listings)
    .set({
      routeFareharbor: fareharbor,
      routeAirwallex: airwallex,
      updatedAt: sql`now()`,
    })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
