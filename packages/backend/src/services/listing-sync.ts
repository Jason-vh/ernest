import { db } from "../db";
import { listings, type NewListing } from "../db/schema";
import { eq, isNull, notInArray, and, sql } from "drizzle-orm";
import { fetchValhallaRoute, OFFICES } from "./valhalla";

interface SyncResult {
  upserted: number;
  disappeared: number;
  routesComputed: number;
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

async function computeRouteForListing(listing: {
  fundaId: string;
  latitude: number;
  longitude: number;
}): Promise<boolean> {
  const from = { lat: listing.latitude, lon: listing.longitude };
  const fareharbor = await fetchValhallaRoute(from, OFFICES.fareharbor);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const airwallex = await fetchValhallaRoute(from, OFFICES.airwallex);
  await new Promise((resolve) => setTimeout(resolve, 200));

  if (fareharbor || airwallex) {
    await db
      .update(listings)
      .set({
        routeFareharbor: fareharbor,
        routeAirwallex: airwallex,
        updatedAt: sql`now()`,
      })
      .where(eq(listings.fundaId, listing.fundaId));
    return true;
  }
  return false;
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

  // Compute routes for listings missing them
  const needRoutes = await db
    .select({
      fundaId: listings.fundaId,
      latitude: listings.latitude,
      longitude: listings.longitude,
    })
    .from(listings)
    .where(and(isNull(listings.disappearedAt), isNull(listings.routeFareharbor)));

  let routesComputed = 0;
  // Sequential: Valhalla rate-limits, must not parallelize
  for (const listing of needRoutes) {
    try {
      const ok = await computeRouteForListing(listing); // eslint-disable-line no-await-in-loop
      if (ok) routesComputed++;
    } catch (err) {
      console.warn(`Failed to compute routes for ${listing.fundaId}:`, err);
    }
  }

  return { upserted: incoming.length, disappeared, routesComputed };
}
