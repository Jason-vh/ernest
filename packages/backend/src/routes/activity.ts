import { Hono } from "hono";
import { eq, isNull, and, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { listings, listingReactions, listingViewings, listingNotes, users } from "@/db/schema";
import type { ActivityListing, ReactionType } from "@ernest/shared";

const activity = new Hono();

const FEED_LIMIT = 100;

activity.get("/", async (c) => {
  const reactionUser = alias(users, "reaction_user");
  const viewingUser = alias(users, "viewing_user");

  const lastActivityExpr = sql<Date>`GREATEST(
    ${listings.createdAt},
    COALESCE(${listingReactions.changedAt}, '-infinity'::timestamptz),
    COALESCE(${listingViewings.updatedAt}, '-infinity'::timestamptz)
  )`;

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      url: listings.url,
      address: listings.address,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      createdAt: listings.createdAt,
      lastActivityAt: lastActivityExpr,
      reactionType: listingReactions.reaction,
      reactionBy: reactionUser.username,
      reactionAt: listingReactions.changedAt,
      reactionNote: listingNotes.text,
      viewingScheduledAt: listingViewings.scheduledAt,
      viewingBy: viewingUser.username,
      viewingUpdatedAt: listingViewings.updatedAt,
    })
    .from(listings)
    .leftJoin(listingReactions, eq(listings.fundaId, listingReactions.fundaId))
    .leftJoin(reactionUser, eq(listingReactions.changedBy, reactionUser.id))
    .leftJoin(
      listingNotes,
      and(
        eq(listingNotes.fundaId, listings.fundaId),
        eq(listingNotes.userId, listingReactions.changedBy),
      ),
    )
    .leftJoin(listingViewings, eq(listings.fundaId, listingViewings.fundaId))
    .leftJoin(viewingUser, eq(listingViewings.scheduledBy, viewingUser.id))
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
      ),
    )
    .orderBy(sql`${lastActivityExpr} DESC`)
    .limit(FEED_LIMIT);

  const items: ActivityListing[] = rows.map((r) => ({
    fundaId: r.fundaId,
    url: r.url,
    address: r.address,
    city: r.city,
    price: r.price,
    photo: r.photos && r.photos.length > 0 ? r.photos[0] : null,
    createdAt: r.createdAt.toISOString(),
    lastActivityAt: r.lastActivityAt.toISOString(),
    reaction:
      r.reactionType && r.reactionBy && r.reactionAt
        ? {
            type: r.reactionType as ReactionType,
            by: r.reactionBy,
            at: r.reactionAt.toISOString(),
            note: r.reactionNote ?? null,
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
