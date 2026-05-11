import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ORIGIN } from "@/config";
import { telegramApi } from "@/services/telegram";

function formatRent(price: number): string {
  return `€${price.toLocaleString("nl-NL")}/mo`;
}

function isActive(listing: { status: string; disappearedAt: Date | null }): boolean {
  if (listing.disappearedAt !== null) return false;
  return listing.status === "Beschikbaar" || listing.status === "";
}

function buildCaption(listing: {
  address: string;
  city: string | null;
  price: number;
  livingArea: number;
  bedrooms: number;
  constructionYear: number | null;
  hasGarden: boolean | null;
  hasBalcony: boolean | null;
  hasRoofTerrace: boolean | null;
}): string {
  const summaryParts: string[] = [
    formatRent(listing.price),
    `${listing.livingArea} m²`,
    `${listing.bedrooms} bed`,
  ];

  const extras: string[] = [];
  if (listing.constructionYear) extras.push(String(listing.constructionYear));
  if (listing.hasGarden) extras.push("Garden");
  if (listing.hasBalcony) extras.push("Balcony");
  if (listing.hasRoofTerrace) extras.push("Roof terrace");

  const firstLineParts: string[] = [listing.address];
  if (listing.city) firstLineParts.push(listing.city);

  const lines: string[] = [`<b>${escapeHtml(firstLineParts.join(" · "))}</b>`];
  lines.push(summaryParts.join(" · "));
  if (extras.length > 0) lines.push(extras.join(" · "));

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
      price: listings.price,
      livingArea: listings.livingArea,
      bedrooms: listings.bedrooms,
      constructionYear: listings.constructionYear,
      hasGarden: listings.hasGarden,
      hasBalcony: listings.hasBalcony,
      hasRoofTerrace: listings.hasRoofTerrace,
      photos: listings.photos,
      status: listings.status,
      disappearedAt: listings.disappearedAt,
      notifiedAt: listings.notifiedAt,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  if (!isActive(listing)) return "skipped";
  if (listing.notifiedAt !== null) return "skipped";

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
