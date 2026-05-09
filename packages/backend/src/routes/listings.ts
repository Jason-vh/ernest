import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "@/types";
import { db } from "@/db";
import { listings, listingReactions, listingNotes, listingViewings } from "@/db/schema";
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

listingsRouter.put("/:fundaId/viewing", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");
  const body = await c.req.json<{ scheduledAt: string; note?: string | null }>();

  const scheduledAtDate = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return c.json({ error: "Invalid scheduledAt — must be an ISO date string" }, 400);
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  const noteValue = note === "" ? null : note;

  const [existing] = await db
    .select({ fundaId: listings.fundaId })
    .from(listings)
    .where(eq(listings.fundaId, fundaId))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Listing not found" }, 404);
  }

  const user = c.get("user")!;

  await db
    .insert(listingViewings)
    .values({
      fundaId,
      scheduledAt: scheduledAtDate,
      note: noteValue,
      scheduledBy: user.sub,
    })
    .onConflictDoUpdate({
      target: listingViewings.fundaId,
      set: {
        scheduledAt: scheduledAtDate,
        note: noteValue,
        scheduledBy: user.sub,
        updatedAt: new Date(),
      },
    });

  await invalidateFundaCache();
  return c.json({ ok: true });
});

listingsRouter.delete("/:fundaId/viewing", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");

  await db.delete(listingViewings).where(eq(listingViewings.fundaId, fundaId));

  await invalidateFundaCache();
  return c.json({ ok: true });
});

export default listingsRouter;
