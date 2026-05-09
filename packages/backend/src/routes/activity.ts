import { Hono } from "hono";
import { eq, isNull, and, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { listings, listingReactions, listingViewings, users } from "@/db/schema";
import type { ActivityEvent } from "@ernest/shared";

const activity = new Hono();

const FEED_LIMIT = 200;

function firstPhoto(photos: string[] | null | undefined): string | null {
  if (!photos || photos.length === 0) return null;
  return photos[0];
}

activity.get("/", async (c) => {
  const activeListing = and(
    isNull(listings.disappearedAt),
    or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
  );

  const listedRows = await db
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      at: listings.createdAt,
    })
    .from(listings)
    .where(activeListing)
    .orderBy(desc(listings.createdAt))
    .limit(FEED_LIMIT);

  const favouriteRows = await db
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      at: listingReactions.changedAt,
      by: users.username,
    })
    .from(listingReactions)
    .innerJoin(listings, eq(listingReactions.fundaId, listings.fundaId))
    .innerJoin(users, eq(listingReactions.changedBy, users.id))
    .where(and(activeListing, eq(listingReactions.reaction, "favourite")))
    .orderBy(desc(listingReactions.changedAt))
    .limit(FEED_LIMIT);

  const viewingRows = await db
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      at: listingViewings.updatedAt,
      by: users.username,
      scheduledAt: listingViewings.scheduledAt,
    })
    .from(listingViewings)
    .innerJoin(listings, eq(listingViewings.fundaId, listings.fundaId))
    .innerJoin(users, eq(listingViewings.scheduledBy, users.id))
    .where(activeListing)
    .orderBy(desc(listingViewings.updatedAt))
    .limit(FEED_LIMIT);

  const events: ActivityEvent[] = [];

  for (const r of listedRows) {
    events.push({
      type: "listed",
      at: r.at.toISOString(),
      fundaId: r.fundaId,
      address: r.address,
      city: r.city,
      price: r.price,
      photo: firstPhoto(r.photos),
    });
  }
  for (const r of favouriteRows) {
    events.push({
      type: "favourited",
      at: r.at.toISOString(),
      fundaId: r.fundaId,
      address: r.address,
      city: r.city,
      price: r.price,
      photo: firstPhoto(r.photos),
      by: r.by,
    });
  }
  for (const r of viewingRows) {
    events.push({
      type: "viewing-scheduled",
      at: r.at.toISOString(),
      fundaId: r.fundaId,
      address: r.address,
      city: r.city,
      price: r.price,
      photo: firstPhoto(r.photos),
      by: r.by,
      scheduledAt: r.scheduledAt.toISOString(),
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return c.json(events.slice(0, FEED_LIMIT));
});

export default activity;
