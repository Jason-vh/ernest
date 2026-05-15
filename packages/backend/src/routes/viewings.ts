import { Hono } from "hono";
import { eq, gte, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, listingViewings, users } from "@/db/schema";
import type { UpcomingViewing } from "@ernest/shared";

const viewings = new Hono();

viewings.get("/upcoming", async (c) => {
  const rows = await db
    .select({
      fundaId: listings.fundaId,
      url: listings.url,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      scheduledAt: listingViewings.scheduledAt,
      note: listingViewings.note,
      scheduledBy: users.username,
    })
    .from(listingViewings)
    .innerJoin(listings, eq(listingViewings.fundaId, listings.fundaId))
    .innerJoin(users, eq(listingViewings.scheduledBy, users.id))
    .where(gte(listingViewings.scheduledAt, sql`now()`))
    .orderBy(asc(listingViewings.scheduledAt));

  const items: UpcomingViewing[] = rows.map((r) => ({
    fundaId: r.fundaId,
    url: r.url,
    address: r.address,
    city: r.city,
    price: r.price,
    photo: r.photos && r.photos.length > 0 ? r.photos[0] : null,
    scheduledAt: r.scheduledAt.toISOString(),
    note: r.note ?? null,
    scheduledBy: r.scheduledBy,
  }));

  return c.json(items);
});

export default viewings;
