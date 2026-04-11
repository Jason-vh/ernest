import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ORIGIN } from "@/config";
import { telegramApi } from "@/services/telegram";
import { isTelegramNotificationEligible } from "@/services/telegram-notification-rules";
import type { RouteResult } from "@/services/google-routes";
import { getEstimatedClosingPrice } from "@ernest/shared";

function formatPrice(price: number): string {
  return `\u20AC${price.toLocaleString("nl-NL")}`;
}

function buildCaption(listing: {
  address: string;
  city: string | null;
  url: string;
  price: number;
  livingArea: number;
  constructionYear: number | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
  energyLabel: string | null;
  routeCentraal: RouteResult | null;
}): string {
  const overbidPrice = getEstimatedClosingPrice(listing.price, listing.url) ?? listing.price;

  // Summary line: price · area
  const summaryParts: string[] = [formatPrice(overbidPrice), `${listing.livingArea} m\u00B2`];

  // Extra facts
  const extras: string[] = [];
  if (listing.constructionYear) extras.push(String(listing.constructionYear));
  if (listing.energyLabel && listing.energyLabel !== "unknown") {
    extras.push(`Label ${listing.energyLabel}`);
  }
  if (listing.hasGarden) extras.push("Garden");
  if (listing.hasBalcony) extras.push("Balcony");
  if (listing.hasRoofTerrace) extras.push("Roof terrace");

  const locationParts: string[] = [];
  if (listing.city) locationParts.push(listing.city);
  if (listing.routeCentraal !== null) {
    locationParts.push(`${listing.routeCentraal.duration} min to Amsterdam Centraal`);
  }

  const lines: string[] = [`<b>${escapeHtml(listing.address)}</b>`];
  if (locationParts.length > 0) lines.push(escapeHtml(locationParts.join(" \u00B7 ")));
  lines.push(summaryParts.join(" \u00B7 "));
  if (extras.length > 0) lines.push(extras.join(" \u00B7 "));

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
      address: listings.address,
      city: listings.city,
      url: listings.url,
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
      routeCentraal: listings.routeCentraal,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  if (!isTelegramNotificationEligible(listing)) return "skipped";

  const caption = buildCaption(listing);
  const photos = listing.photos ?? [];
  const chatId = TELEGRAM_CHAT_ID;

  const ernestUrl = `${ORIGIN}/?listing=${listing.fundaId}`;
  const replyMarkup = {
    inline_keyboard: [[{ text: "View", url: ernestUrl }]],
  };

  let response: unknown;
  if (photos.length >= 1) {
    response = await telegramApi("sendPhoto", {
      chat_id: chatId,
      photo: photos[0],
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } else {
    response = await telegramApi("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }

  // Extract message_id from Telegram response using runtime narrowing
  let telegramMessageId: number | undefined;
  if (
    typeof response === "object" &&
    response !== null &&
    "result" in response &&
    typeof response.result === "object" &&
    response.result !== null &&
    "message_id" in response.result &&
    typeof response.result.message_id === "number"
  ) {
    telegramMessageId = response.result.message_id;
  }

  await db
    .update(listings)
    .set({ notifiedAt: sql`now()`, telegramMessageId })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
