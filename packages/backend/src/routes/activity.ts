import { Hono } from "hono";
import { eq, isNull, and, or, sql, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { listings, listingViewings, listingNotes, users } from "@/db/schema";
import type { ActivityListing, ListingState } from "@ernest/shared";

const activity = new Hono();

const FEED_LIMIT = 100;

const STATE_FILTERS = ["all", "liked", "discarded", "viewing", "applied", "untouched"] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

function parseState(raw: string | undefined): StateFilter {
  return STATE_FILTERS.includes(raw as StateFilter) ? (raw as StateFilter) : "all";
}

activity.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const state = parseState(c.req.query("state"));
  const stateUser = alias(users, "state_user");
  const viewingUser = alias(users, "viewing_user");

  const lastActivityExpr = sql<Date>`GREATEST(
    ${listings.createdAt},
    COALESCE(${listings.stateAt}, '-infinity'::timestamptz),
    COALESCE(${listingViewings.updatedAt}, '-infinity'::timestamptz)
  )`;

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      source: listings.source,
      url: listings.url,
      address: listings.address,
      postcode: listings.postcode,
      city: listings.city,
      price: listings.price,
      photos: listings.photos,
      createdAt: listings.createdAt,
      lastActivityAt: lastActivityExpr,
      listingState: listings.state,
      stateBy: stateUser.username,
      stateAt: listings.stateAt,
      stateNote: listingNotes.text,
      viewingScheduledAt: listingViewings.scheduledAt,
      viewingBy: viewingUser.username,
      viewingUpdatedAt: listingViewings.updatedAt,
    })
    .from(listings)
    .leftJoin(stateUser, eq(listings.stateBy, stateUser.id))
    .leftJoin(
      listingNotes,
      and(eq(listingNotes.fundaId, listings.fundaId), eq(listingNotes.userId, listings.stateBy)),
    )
    .leftJoin(listingViewings, eq(listings.fundaId, listingViewings.fundaId))
    .leftJoin(viewingUser, eq(listingViewings.scheduledBy, viewingUser.id))
    .where(
      and(
        isNull(listings.disappearedAt),
        or(eq(listings.status, "Beschikbaar"), eq(listings.status, "")),
        q === ""
          ? undefined
          : or(
              ilike(listings.address, `%${q}%`),
              ilike(listings.postcode, `%${q}%`),
              ilike(listings.city, `%${q}%`),
            ),
        state === "liked" ? eq(listings.state, "liked") : undefined,
        state === "discarded" ? eq(listings.state, "discarded") : undefined,
        state === "viewing" ? eq(listings.state, "viewing") : undefined,
        state === "applied" ? eq(listings.state, "applied") : undefined,
        state === "untouched" ? isNull(listings.state) : undefined,
      ),
    )
    .orderBy(sql`${lastActivityExpr} DESC`)
    .limit(FEED_LIMIT);

  const items: ActivityListing[] = rows.map((r) => ({
    fundaId: r.fundaId,
    source: r.source,
    url: r.url,
    address: r.address,
    postcode: r.postcode,
    city: r.city,
    price: r.price,
    photo: r.photos && r.photos.length > 0 ? r.photos[0] : null,
    createdAt: r.createdAt.toISOString(),
    lastActivityAt: new Date(r.lastActivityAt as unknown as string | Date).toISOString(),
    state: (r.listingState as ListingState | null) ?? null,
    stateBy: r.stateBy ?? null,
    stateAt: r.stateAt ? r.stateAt.toISOString() : null,
    note: r.stateNote ?? null,
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
