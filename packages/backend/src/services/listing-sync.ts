import { db } from "@/db";
import { listings, type NewListing } from "@/db/schema";
import { ANTHROPIC_API_KEY } from "@/config";
import { isNull, notInArray, and, or, eq, sql } from "drizzle-orm";
import { enqueueMany } from "@/services/job-queue";
import { matchBuurt, type BuurtStats } from "@/services/buurt-matcher";
import {
  hasMeaningfulDescription,
  hashDescription,
} from "@/services/listing-description-translation";

/** Listing is active: not disappeared and status is available */
const isActiveListing = and(
  isNull(listings.disappearedAt),
  or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
);

interface SyncResult {
  upserted: number;
  disappeared: number;
  jobsEnqueued: number;
}

async function upsertListing(listing: NewListing, buurt: BuurtStats | null) {
  const buurtFields = {
    buurtWozValue: buurt?.buurtWozValue ?? null,
    buurtSafetyRating: buurt?.buurtSafetyRating ?? null,
    buurtCrimesPer1000: buurt?.buurtCrimesPer1000 ?? null,
    buurtOwnerOccupiedPct: buurt?.buurtOwnerOccupiedPct ?? null,
  };

  return db
    .insert(listings)
    .values({ ...listing, ...buurtFields })
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
        houseType: listing.houseType,
        constructionYear: listing.constructionYear,
        description: listing.description,
        descriptionEn: sql`CASE
          WHEN excluded.description IS DISTINCT FROM ${listings.description} THEN NULL
          ELSE ${listings.descriptionEn}
        END`,
        descriptionEnSourceHash: sql`CASE
          WHEN excluded.description IS DISTINCT FROM ${listings.description} THEN NULL
          ELSE ${listings.descriptionEnSourceHash}
        END`,
        ownership: listing.ownership,
        vveCostsMonthly: listing.vveCostsMonthly,
        erfpachtCostsMonthly: listing.erfpachtCostsMonthly,
        // Only update WOZ if incoming value is non-null (don't overwrite existing with null)
        ...(listing.wozValue != null ? { wozValue: listing.wozValue } : {}),
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
        ...buurtFields,
      },
    });
}

export async function syncListings(incoming: NewListing[]): Promise<SyncResult> {
  // Upsert all listings sequentially (DB operations, fine to serialize)
  for (const listing of incoming) {
    const buurt = matchBuurt(listing.latitude, listing.longitude);
    await upsertListing(listing, buurt); // eslint-disable-line no-await-in-loop
  }

  // Mark disappeared: only if incoming set is large enough relative to current active count
  // This guards against partial fetches (e.g. transient API errors) marking everything as gone
  let disappeared = 0;
  if (incoming.length > 0) {
    const [{ count: activeCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(isNull(listings.disappearedAt));

    const MIN_RATIO = 0.5;
    if (activeCount === 0 || incoming.length >= activeCount * MIN_RATIO) {
      const incomingIds = incoming.map((l) => l.fundaId);
      const result = await db
        .update(listings)
        .set({ disappearedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(isNull(listings.disappearedAt), notInArray(listings.fundaId, incomingIds)))
        .returning({ fundaId: listings.fundaId });
      disappeared = result.length;
    } else {
      console.warn(
        `Funda sync: received ${incoming.length} listings but ${activeCount} are active — skipping mark-disappeared (possible partial fetch)`,
      );
    }
  }

  // Enqueue jobs for active listings needing routes
  const needRoutes = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(and(isActiveListing, isNull(listings.routeCentraal)));

  const routeJobs = needRoutes.map((r) => ({
    type: "compute-routes" as const,
    fundaId: r.fundaId,
    maxAttempts: 3,
  }));

  const routesEnqueued = await enqueueMany(routeJobs);

  let translatedEnqueued = 0;
  if (ANTHROPIC_API_KEY) {
    const candidates = await db
      .select({
        fundaId: listings.fundaId,
        description: listings.description,
        descriptionEnSourceHash: listings.descriptionEnSourceHash,
      })
      .from(listings)
      .where(isActiveListing);

    const translateJobs = candidates
      .filter((listing) => {
        if (!hasMeaningfulDescription(listing.description)) return false;
        return listing.descriptionEnSourceHash !== hashDescription(listing.description);
      })
      .map((listing) => ({
        type: "translate-description" as const,
        fundaId: listing.fundaId,
        maxAttempts: 3,
      }));

    translatedEnqueued = await enqueueMany(translateJobs);
  }

  return {
    upserted: incoming.length,
    disappeared,
    jobsEnqueued: routesEnqueued + translatedEnqueued,
  };
}
