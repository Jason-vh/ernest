import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ORIGIN } from "@/config";
import type { RouteResult } from "@/services/valhalla";

async function telegramApi(method: string, body: unknown): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${method} failed (${res.status}): ${text}`);
  }
}

function formatPrice(price: number): string {
  return `\u20AC${price.toLocaleString("nl-NL")}`;
}

function routeMinutes(route: RouteResult | null): number | null {
  if (!route) return null;
  return Math.round(route.duration / 60);
}

function buildCaption(listing: {
  address: string;
  price: number;
  livingArea: number;
  constructionYear: number | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
  energyLabel: string | null;
  routeFareharbor: RouteResult | null;
  routeAirwallex: RouteResult | null;
  aiPositives: string[] | null;
  aiNegatives: string[] | null;
}): string {
  const overbidPrice = Math.round(listing.price * 1.15);

  // Summary line: price · area · commute
  const summaryParts: string[] = [formatPrice(overbidPrice), `${listing.livingArea} m\u00B2`];
  const fhMin = routeMinutes(listing.routeFareharbor);
  const awMin = routeMinutes(listing.routeAirwallex);
  if (fhMin !== null && awMin !== null) {
    summaryParts.push(`${fhMin} / ${awMin} min cycle`);
  } else if (fhMin !== null) {
    summaryParts.push(`${fhMin} min cycle`);
  } else if (awMin !== null) {
    summaryParts.push(`${awMin} min cycle`);
  }

  // Extra facts
  const extras: string[] = [];
  if (listing.constructionYear) extras.push(String(listing.constructionYear));
  if (listing.energyLabel && listing.energyLabel !== "unknown") {
    extras.push(`Label ${listing.energyLabel}`);
  }
  if (listing.hasGarden) extras.push("Garden");
  if (listing.hasBalcony) extras.push("Balcony");
  if (listing.hasRoofTerrace) extras.push("Roof terrace");

  const positives = (listing.aiPositives ?? []).slice(0, 3);
  const negatives = (listing.aiNegatives ?? []).slice(0, 2);

  const lines: string[] = [`<b>${escapeHtml(listing.address)}</b>`];
  lines.push(summaryParts.join(" \u00B7 "));
  if (extras.length > 0) lines.push(extras.join(" \u00B7 "));

  if (positives.length > 0) {
    lines.push("");
    lines.push("<b>The good</b>");
    for (const p of positives) lines.push(`- ${escapeHtml(p)}`);
  }

  if (negatives.length > 0) {
    lines.push("");
    lines.push("<b>The bad</b>");
    for (const n of negatives) lines.push(`- ${escapeHtml(n)}`);
  }

  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function handleTelegramNotify(job: Job): Promise<"completed" | "skipped"> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return "skipped";

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      url: listings.url,
      address: listings.address,
      price: listings.price,
      livingArea: listings.livingArea,
      constructionYear: listings.constructionYear,
      hasGarden: listings.hasGarden,
      hasBalcony: listings.hasBalcony,
      hasRoofTerrace: listings.hasRoofTerrace,
      energyLabel: listings.energyLabel,
      photos: listings.photos,
      status: listings.status,
      disappearedAt: listings.disappearedAt,
      routeFareharbor: listings.routeFareharbor,
      routeAirwallex: listings.routeAirwallex,
      aiPositives: listings.aiPositives,
      aiNegatives: listings.aiNegatives,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  // Skip if listing is no longer active
  if (listing.disappearedAt !== null) return "skipped";
  if (listing.status !== "Beschikbaar" && listing.status !== "") return "skipped";

  const caption = buildCaption(listing);
  const photos = listing.photos ?? [];
  const chatId = TELEGRAM_CHAT_ID;

  const ernestUrl = `${ORIGIN}/?listing=${listing.fundaId}`;
  const replyMarkup = {
    inline_keyboard: [[{ text: "View", url: ernestUrl }]],
  };

  if (photos.length >= 1) {
    await telegramApi("sendPhoto", {
      chat_id: chatId,
      photo: photos[0],
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } else {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }

  return "completed";
}
