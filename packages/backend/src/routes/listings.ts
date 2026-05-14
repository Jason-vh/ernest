import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { AppEnv } from "@/types";
import { db } from "@/db";
import { listings, listingNotes, listingViewings } from "@/db/schema";
import type { ListingState } from "@/db/schema";
import { requireAuth, csrfCheck } from "@/auth/middleware";
import { invalidateFundaCache } from "@/routes/geodata";
import { telegramApi } from "@/services/telegram";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY } from "@/config";
import {
  analyzeListingCatch,
  hashCatchSource,
  type ListingAnalysisResult,
} from "@/services/ai-catch-analysis";
import {
  hasMeaningfulDescription,
  hashDescription,
  translateListingDescription,
} from "@/services/listing-description-translation";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/services/viewing-calendar";

const listingsRouter = new Hono<AppEnv>();

// All mutation routes require auth + CSRF
listingsRouter.use("/*", csrfCheck);

listingsRouter.put("/:fundaId/state", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");
  const body = await c.req.json<{ state: string | null }>();
  const { state } = body;

  const validStates: Array<ListingState | null> = ["liked", "discarded", "applied", null];
  if (!validStates.includes(state as ListingState | null)) {
    return c.json(
      { error: "Invalid state. Must be 'liked', 'discarded', 'applied', or null" },
      400,
    );
  }

  const [existing] = await db
    .select({ fundaId: listings.fundaId, telegramMessageId: listings.telegramMessageId })
    .from(listings)
    .where(eq(listings.fundaId, fundaId))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Listing not found" }, 404);
  }

  const user = c.get("user")!;

  if (state === null) {
    await db
      .update(listings)
      .set({ state: null, stateBy: null, stateAt: null, updatedAt: sql`now()` })
      .where(eq(listings.fundaId, fundaId));
  } else {
    // Setting a non-viewing state — also clear any existing viewing
    await db
      .update(listings)
      .set({
        state: state as ListingState,
        stateBy: user.sub,
        stateAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(eq(listings.fundaId, fundaId));

    const [existingViewing] = await db
      .select({ calendarEventId: listingViewings.calendarEventId })
      .from(listingViewings)
      .where(eq(listingViewings.fundaId, fundaId))
      .limit(1);
    if (existingViewing) {
      await db.delete(listingViewings).where(eq(listingViewings.fundaId, fundaId));
      if (existingViewing.calendarEventId) {
        deleteCalendarEvent(existingViewing.calendarEventId).catch((err) => {
          console.warn(`Failed to delete calendar event for ${fundaId}:`, err);
        });
      }
    }
  }

  // Fire-and-forget Telegram reaction update for liked/discarded
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && existing.telegramMessageId) {
    const emojiMap: Record<string, Array<{ type: string; emoji: string }>> = {
      liked: [{ type: "emoji", emoji: "❤️" }],
      discarded: [{ type: "emoji", emoji: "🥱" }],
    };
    const telegramReaction = state !== null ? (emojiMap[state] ?? []) : [];

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
    await db
      .delete(listingNotes)
      .where(and(eq(listingNotes.fundaId, fundaId), eq(listingNotes.userId, user.sub)));
  } else {
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
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      postcode: listings.postcode,
      city: listings.city,
    })
    .from(listings)
    .where(eq(listings.fundaId, fundaId))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Listing not found" }, 404);
  }

  const [existingViewing] = await db
    .select({ calendarEventId: listingViewings.calendarEventId })
    .from(listingViewings)
    .where(eq(listingViewings.fundaId, fundaId))
    .limit(1);

  const user = c.get("user")!;

  const payload = {
    fundaId,
    address: existing.address,
    postcode: existing.postcode,
    city: existing.city,
    scheduledAt: scheduledAtDate,
    note: noteValue,
  };

  let calendarEventId: string | null = existingViewing?.calendarEventId ?? null;
  if (calendarEventId) {
    await updateCalendarEvent(calendarEventId, payload);
  } else {
    calendarEventId = await createCalendarEvent(payload);
  }

  const now = new Date();

  await db
    .insert(listingViewings)
    .values({
      fundaId,
      scheduledAt: scheduledAtDate,
      note: noteValue,
      scheduledBy: user.sub,
      calendarEventId,
    })
    .onConflictDoUpdate({
      target: listingViewings.fundaId,
      set: {
        scheduledAt: scheduledAtDate,
        note: noteValue,
        scheduledBy: user.sub,
        ...(calendarEventId !== null ? { calendarEventId } : {}),
        updatedAt: now,
      },
    });

  // Viewing is the active state
  await db
    .update(listings)
    .set({ state: "viewing", stateBy: user.sub, stateAt: now, updatedAt: sql`now()` })
    .where(eq(listings.fundaId, fundaId));

  await invalidateFundaCache();
  return c.json({ ok: true });
});

listingsRouter.delete("/:fundaId/viewing", requireAuth, async (c) => {
  const fundaId = c.req.param("fundaId");

  const [existingViewing] = await db
    .select({ calendarEventId: listingViewings.calendarEventId })
    .from(listingViewings)
    .where(eq(listingViewings.fundaId, fundaId))
    .limit(1);

  await db.delete(listingViewings).where(eq(listingViewings.fundaId, fundaId));

  if (existingViewing?.calendarEventId) {
    await deleteCalendarEvent(existingViewing.calendarEventId);
  }

  // Clear the viewing state
  await db
    .update(listings)
    .set({ state: null, stateBy: null, stateAt: null, updatedAt: sql`now()` })
    .where(eq(listings.fundaId, fundaId));

  await invalidateFundaCache();
  return c.json({ ok: true });
});

listingsRouter.post("/:fundaId/catch", requireAuth, async (c) => {
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: "Catch analysis unavailable (no API key)" }, 503);
  }

  const fundaId = c.req.param("fundaId");
  const force = c.req.query("force") === "1";

  const [listing] = await db.select().from(listings).where(eq(listings.fundaId, fundaId)).limit(1);
  if (!listing) {
    return c.json({ error: "Listing not found" }, 404);
  }
  if (listing.disappearedAt !== null) {
    return c.json({ error: "Listing no longer active" }, 410);
  }

  const expectedHash = hashCatchSource(listing);
  if (!force && listing.aiCatch != null && listing.aiCatchSourceHash === expectedHash) {
    return c.json({
      aiCatch: listing.aiCatch,
      aiHasBathtub: listing.aiHasBathtub ?? null,
      aiHasOutsideArea: listing.aiHasOutsideArea ?? null,
      cached: true,
    });
  }

  let result: ListingAnalysisResult;
  try {
    result = await analyzeListingCatch(listing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Catch analysis failed for ${fundaId}: ${message}`);
    return c.json({ error: "Analysis failed", detail: message }, 502);
  }

  await db
    .update(listings)
    .set({
      aiCatch: result.concerns,
      aiHasBathtub: result.hasBathtub,
      aiHasOutsideArea: result.hasOutsideArea,
      aiCatchSourceHash: expectedHash,
      updatedAt: sql`now()`,
    })
    .where(eq(listings.fundaId, fundaId));

  await invalidateFundaCache();

  return c.json({
    aiCatch: result.concerns,
    aiHasBathtub: result.hasBathtub,
    aiHasOutsideArea: result.hasOutsideArea,
    cached: false,
  });
});

listingsRouter.post("/:fundaId/translate", requireAuth, async (c) => {
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: "Translation unavailable (no API key)" }, 503);
  }

  const fundaId = c.req.param("fundaId");
  const force = c.req.query("force") === "1";

  const [listing] = await db.select().from(listings).where(eq(listings.fundaId, fundaId)).limit(1);
  if (!listing) {
    return c.json({ error: "Listing not found" }, 404);
  }
  if (listing.disappearedAt !== null) {
    return c.json({ error: "Listing no longer active" }, 410);
  }
  if (!hasMeaningfulDescription(listing.description)) {
    return c.json({ error: "Listing has no description to translate" }, 422);
  }

  const expectedHash = hashDescription(listing.description);
  if (!force && listing.descriptionEn != null && listing.descriptionEnSourceHash === expectedHash) {
    return c.json({ descriptionEn: listing.descriptionEn, cached: true });
  }

  let descriptionEn: string;
  try {
    descriptionEn = await translateListingDescription(listing.description);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Translation failed for ${fundaId}: ${message}`);
    return c.json({ error: "Translation failed", detail: message }, 502);
  }

  await db
    .update(listings)
    .set({
      descriptionEn,
      descriptionEnSourceHash: expectedHash,
      updatedAt: sql`now()`,
    })
    .where(eq(listings.fundaId, fundaId));

  await invalidateFundaCache();

  return c.json({ descriptionEn, cached: false });
});

export default listingsRouter;
