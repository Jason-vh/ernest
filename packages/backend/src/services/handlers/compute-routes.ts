import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { fetchValhallaRoute, OFFICES } from "@/services/valhalla";

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
  const fareharbor = await fetchValhallaRoute(from, OFFICES.fareharbor);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const airwallex = await fetchValhallaRoute(from, OFFICES.airwallex);

  // If both routes are null (Valhalla down), throw so the job retries with backoff
  if (fareharbor === null && airwallex === null) {
    throw new Error("Valhalla unreachable: both route requests returned null");
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
