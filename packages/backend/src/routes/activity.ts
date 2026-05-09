import { Hono } from "hono";
import { eq, isNull, and, or, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { listings, listingReactions, listingViewings, users } from "@/db/schema";
import type { ActivityListing, ReactionType } from "@ernest/shared";

const activity = new Hono();

const FEED_LIMIT = 100;

activity.get("/", async (c) => {
  const reactionUser = alias(users, "reaction_user");
  const viewingUser = alias(users, "viewing_user");

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      createdAt: listings.createdAt,
      reactionType: listingReactions.reaction,
      reactionBy: reactionUser.username,
      reactionAt: listingReactions.changedAt,
      viewingScheduledAt: listingViewings.scheduledAt,
      viewingBy: viewingUser.username,
      viewingUpdatedAt: listingViewings.updatedAt,
    })
    .from(listings)
    .leftJoin(listingReactions, eq(listings.fundaId, listingReactions.fundaId))
    .leftJoin(reactionUser, eq(listingReactions.changedBy, reactionUser.id))
    .leftJoin(listingViewings, eq(listings.fundaId, listingViewings.fundaId))
    .leftJoin(viewingUser, eq(listingViewings.scheduledBy, viewingUser.id))
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    )
    .orderBy(desc(listings.createdAt))
    .limit(FEED_LIMIT);

  const items: ActivityListing[] = rows.map((r) => ({
    fundaId: r.fundaId,
    address: r.address,
    city: r.city,
    price: r.price,
    photo: r.photos && r.photos.length > 0 ? r.photos[0] : null,
    createdAt: r.createdAt.toISOString(),
    reaction:
      r.reactionType && r.reactionBy && r.reactionAt
        ? {
            type: r.reactionType as ReactionType,
            by: r.reactionBy,
            at: r.reactionAt.toISOString(),
          }
        : null,
    viewing:
      r.viewingScheduledAt && r.viewingBy
        ? {
            scheduledAt: r.viewingScheduledAt.toISOString(),
            by: r.viewingBy,
            at: (r.viewingUpdatedAt ?? r.viewingScheduledAt).toISOString(),
          }
        : null,
  }));

  return c.json(items);
});

export default activity;
