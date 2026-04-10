import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { fetchGoogleRoute, AMSTERDAM_CENTRAAL } from "@/services/google-routes";

export async function handleComputeRoutes(job: Job): Promise<"completed" | "skipped"> {
  // Fetch listing coords
  const rows = await db
    .select({
      fundaId: listings.fundaId,
      latitude: listings.latitude,
      longitude: listings.longitude,
      routeCentraal: listings.routeCentraal,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  // Already has routes
  if (listing.routeCentraal !== null) return "skipped";

  const from = { lat: listing.latitude, lon: listing.longitude };
  const centraal = await fetchGoogleRoute(from, AMSTERDAM_CENTRAAL, true);

  if (centraal === null) {
    throw new Error("Google Routes API unreachable: route request returned null");
  }

  await db
    .update(listings)
    .set({
      routeCentraal: centraal,
      updatedAt: sql`now()`,
    })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
