import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "@/types";
import { db } from "@/db";
import { listings, listingReactions, listingNotes, manualListings } from "@/db/schema";
import { requireAuth, csrfCheck } from "@/auth/middleware";
import { invalidateFundaCache } from "@/routes/geodata";
import { telegramApi } from "@/services/telegram";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "@/config";

const listingsRouter = new Hono<AppEnv>();

// All mutation routes require auth + CSRF
listingsRouter.use("/*", csrfCheck);

listingsRouter.put("/:fundaId/reaction", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");
  const body = await c.req.json<{ reaction: string | null }>();
  const { reaction } = body;

  // Validate reaction value
  if (reaction !== null && reaction !== "favourite" && reaction !== "discarded") {
    return c.json({ error: "Invalid reaction. Must be 'favourite', 'discarded', or null" }, 400);
  }

  // Validate listing exists
  const [existing] = await db
    .select({ fundaId: listings.fundaId, telegramMessageId: listings.telegramMessageId })
    .from(listings)
    .where(eq(listings.fundaId, fundaId))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Listing not found" }, 404);
  }

  const user = c.get("user")!;

  if (reaction === null) {
    // Remove reaction
    await db.delete(listingReactions).where(eq(listingReactions.fundaId, fundaId));
  } else {
    // Upsert reaction
    await db
      .insert(listingReactions)
      .values({
        fundaId,
        reaction,
        changedBy: user.sub,
        changedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: listingReactions.fundaId,
        set: {
          reaction,
          changedBy: user.sub,
          changedAt: new Date(),
        },
      });
  }

  // Fire-and-forget Telegram reaction update
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && existing.telegramMessageId) {
    const emojiMap: Record<string, Array<{ type: string; emoji: string }>> = {
      favourite: [{ type: "emoji", emoji: "\u2764\uFE0F" }],
      discarded: [{ type: "emoji", emoji: "\uD83E\uDD71" }],
    };
    const telegramReaction = reaction !== null ? (emojiMap[reaction] ?? []) : [];

    telegramApi("setMessageReaction", {
      chat_id: TELEGRAM_CHAT_ID,
      message_id: existing.telegramMessageId,
      reaction: telegramReaction,
    }).catch((err) => {
      console.warn(`Failed to set Telegram reaction for ${fundaId}:`, err);
    });
  }

  await invalidateFundaCache();
  return c.json({ ok: true });
});

listingsRouter.put("/:fundaId/note", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");
  const body = await c.req.json<{ text: string }>();
  const text = body.text?.trim() ?? "";

  // Validate listing exists
  const [existing] = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(eq(listings.fundaId, fundaId))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Listing not found" }, 404);
  }

  const user = c.get("user")!;

  if (text === "") {
    // Delete note
    await db
      .delete(listingNotes)
      .where(and(eq(listingNotes.fundaId, fundaId), eq(listingNotes.userId, user.sub)));
  } else {
    // Upsert note
    const id = crypto.randomUUID();
    await db
      .insert(listingNotes)
      .values({
        id,
        fundaId,
        userId: user.sub,
        text,
      })
      .onConflictDoUpdate({
        target: [listingNotes.fundaId, listingNotes.userId],
        set: {
          text,
          updatedAt: new Date(),
        },
      });
  }

  await invalidateFundaCache();
  return c.json({ ok: true });
});

// --- Manual listings CRUD ---

listingsRouter.post("/manual", requireAuth, async (c) => {
  const body = await c.req.json<{ url: string }>();
  const url = body.url?.trim() ?? "";

  // Validate URL matches funda.nl pattern
  if (!/^https?:\/\/(www\.)?funda\.nl\//.test(url)) {
    return c.json({ error: "URL must be a funda.nl listing URL" }, 400);
  }

  const user = c.get("user")!;

  // Check for existing entry
  const [existing] = await db
    .select()
    .from(manualListings)
    .where(eq(manualListings.url, url))
    .limit(1);
  if (existing) {
    return c.json({ error: "This URL has already been submitted", existing }, 409);
  }

  const [row] = await db.insert(manualListings).values({ url, createdBy: user.sub }).returning();

  return c.json(row, 201);
});

listingsRouter.get("/manual", requireAuth, async (c) => {
  const rows = await db
    .select({
      id: manualListings.id,
      url: manualListings.url,
      fundaId: manualListings.fundaId,
      status: manualListings.status,
      error: manualListings.error,
      createdAt: manualListings.createdAt,
      // Listing fields when available
      address: listings.address,
      price: listings.price,
      photos: listings.photos,
    })
    .from(manualListings)
    .leftJoin(listings, eq(manualListings.fundaId, listings.fundaId))
    .orderBy(manualListings.createdAt);

  return c.json(rows);
});

listingsRouter.delete("/manual/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  // Find the manual listing entry
  const [entry] = await db.select().from(manualListings).where(eq(manualListings.id, id)).limit(1);
  if (!entry) {
    return c.json({ error: "Not found" }, 404);
  }

  const user = c.get("user")!;
  if (entry.createdBy !== user.sub) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Delete the manual_listings row
  await db.delete(manualListings).where(eq(manualListings.id, id));

  // If a matching listing exists with manual=true, unset it
  if (entry.fundaId) {
    await db
      .update(listings)
      .set({ manual: false })
      .where(and(eq(listings.fundaId, entry.fundaId), eq(listings.manual, true)));
  }

  await invalidateFundaCache();
  return c.json({ ok: true });
});

export default listingsRouter;
