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
    buurtSafetyRating: buurt?.buurtSafetyRating ?? null,
    buurtCrimesPer1000: buurt?.buurtCrimesPer1000 ?? null,
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
        ...(listing.city != null ? { city: listing.city } : {}),
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

  // Telegram notifications are currently disabled. Handler and rules remain in place,
  // so re-enabling means flipping this flag.
  const TELEGRAM_NOTIFICATIONS_ENABLED = false;
  let notifyEnqueued = 0;
  if (TELEGRAM_NOTIFICATIONS_ENABLED) {
    const notifyCandidates = await db
      .select({ fundaId: listings.fundaId })
      .from(listings)
      .where(and(isActiveListing, isNull(listings.notifiedAt)));

    const notifyJobs = notifyCandidates.map((l) => ({
      type: "telegram-notify" as const,
      fundaId: l.fundaId,
      maxAttempts: 3,
    }));
    notifyEnqueued = await enqueueMany(notifyJobs);
  }

  return {
    upserted: incoming.length,
    disappeared,
    jobsEnqueued: translatedEnqueued + notifyEnqueued,
  };
}
