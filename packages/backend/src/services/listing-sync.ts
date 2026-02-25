import { db } from "@/db";
import { listings, type NewListing } from "@/db/schema";
import { isNull, notInArray, and, sql } from "drizzle-orm";
import { enqueueMany } from "@/services/job-queue";

interface SyncResult {
  upserted: number;
  disappeared: number;
  jobsEnqueued: number;
}

async function upsertListing(listing: NewListing) {
  return db
    .insert(listings)
    .values(listing)
    .onConflictDoUpdate({
      target: listings.fundaId,
      set: {
        url: listing.url,
        address: listing.address,
        postcode: listing.postcode,
        neighbourhood: listing.neighbourhood,
        price: listing.price,
        bedrooms: listing.bedrooms,
        livingArea: listing.livingArea,
        energyLabel: listing.energyLabel,
        objectType: listing.objectType,
        constructionYear: listing.constructionYear,
        description: listing.description,
        hasGarden: listing.hasGarden,
        hasBalcony: listing.hasBalcony,
        hasRoofTerrace: listing.hasRoofTerrace,
        latitude: listing.latitude,
        longitude: listing.longitude,
        photos: listing.photos,
        status: listing.status,
        offeredSince: listing.offeredSince,
        disappearedAt: null,
        updatedAt: sql`now()`,
      },
    });
}

export async function syncListings(incoming: NewListing[]): Promise<SyncResult> {
  // Upsert all listings sequentially (DB operations, fine to serialize)
  for (const listing of incoming) {
    await upsertListing(listing); // eslint-disable-line no-await-in-loop
  }

  // Mark disappeared: only if incoming set is non-empty (guards against API failures)
  let disappeared = 0;
  if (incoming.length > 0) {
    const incomingIds = incoming.map((l) => l.fundaId);
    const result = await db
      .update(listings)
      .set({ disappearedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(isNull(listings.disappearedAt), notInArray(listings.fundaId, incomingIds)))
      .returning({ fundaId: listings.fundaId });
    disappeared = result.length;
  }

  // Enqueue jobs for listings needing routes
  const needRoutes = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(and(isNull(listings.disappearedAt), isNull(listings.routeFareharbor)));

  // Enqueue jobs for listings needing AI enrichment
  const needAi = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(and(isNull(listings.disappearedAt), isNull(listings.aiPositives)));

  const routeJobs = needRoutes.map((r) => ({
    type: "compute-routes" as const,
    fundaId: r.fundaId,
    maxAttempts: 3,
  }));
  const aiJobs = needAi.map((r) => ({
    type: "ai-enrich" as const,
    fundaId: r.fundaId,
    maxAttempts: 2,
  }));

  const routesEnqueued = await enqueueMany(routeJobs);
  const aiEnqueued = await enqueueMany(aiJobs);

  return { upserted: incoming.length, disappeared, jobsEnqueued: routesEnqueued + aiEnqueued };
}
