import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "@/config";
import { ORIGIN } from "@/config";
import type { RouteResult } from "@/services/valhalla";

const CAPTION_LIMIT = 1024;

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
  neighbourhood: string | null;
  postcode: string | null;
  price: number;
  bedrooms: number;
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

  // Location line
  const locationParts = [listing.neighbourhood, listing.postcode].filter(Boolean);
  const locationLine = locationParts.length > 0 ? locationParts.join(" \u00B7 ") : "";

  // Facts line
  const facts: string[] = [`${listing.bedrooms} beds`, `${listing.livingArea} m\u00B2`];
  if (listing.constructionYear) facts.push(String(listing.constructionYear));
  if (listing.hasGarden) facts.push("Garden");
  if (listing.hasBalcony) facts.push("Balcony");
  if (listing.hasRoofTerrace) facts.push("Roof terrace");

  // Route line
  const routeParts: string[] = [];
  if (listing.energyLabel) routeParts.push(`Label ${listing.energyLabel}`);
  const fhMin = routeMinutes(listing.routeFareharbor);
  const awMin = routeMinutes(listing.routeAirwallex);
  if (fhMin !== null) routeParts.push(`\uD83D\uDEB4 ${fhMin} min FH`);
  if (awMin !== null) routeParts.push(`${awMin} min AW`);
  const routeLine = routeParts.join(" \u00B7 ");

  // Build with max 3 positives, 2 negatives
  const maxPositives = 3;
  const maxNegatives = 2;
  const positives = (listing.aiPositives ?? []).slice(0, maxPositives);
  const negatives = (listing.aiNegatives ?? []).slice(0, maxNegatives);

  function assemble(pos: string[], neg: string[]): string {
    const lines: string[] = [`\uD83C\uDFE0 <b>${escapeHtml(listing.address)}</b>`];
    if (locationLine) lines.push(escapeHtml(locationLine));
    lines.push("");
    lines.push(
      `\uD83D\uDCB0 ${formatPrice(listing.price)} asking \u00B7 ${formatPrice(overbidPrice)} overbid`,
    );
    lines.push(facts.join(" \u00B7 "));
    if (routeLine) lines.push(routeLine);

    if (pos.length > 0 || neg.length > 0) {
      lines.push("");
      for (const p of pos) lines.push(`\u2705 ${escapeHtml(p)}`);
      for (const n of neg) lines.push(`\u26A0\uFE0F ${escapeHtml(n)}`);
    }

    return lines.join("\n");
  }

  let caption = assemble(positives, negatives);
  if (caption.length <= CAPTION_LIMIT) return caption;

  // Drop positives first
  caption = assemble([], negatives);
  if (caption.length <= CAPTION_LIMIT) return caption;

  // Drop negatives too
  return assemble([], []);
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
      postcode: listings.postcode,
      neighbourhood: listings.neighbourhood,
      price: listings.price,
      bedrooms: listings.bedrooms,
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

  // Send photos + caption
  if (photos.length >= 2) {
    const media = photos.slice(0, 4).map((url, i) => {
      const item: Record<string, string> = { type: "photo", media: url };
      if (i === 0) {
        item.caption = caption;
        item.parse_mode = "HTML";
      }
      return item;
    });
    await telegramApi("sendMediaGroup", { chat_id: chatId, media });
  } else if (photos.length === 1) {
    await telegramApi("sendPhoto", {
      chat_id: chatId,
      photo: photos[0],
      caption,
      parse_mode: "HTML",
    });
  } else {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
    });
  }

  // Send inline buttons
  const ernestUrl = `${ORIGIN}/?listing=${listing.fundaId}`;
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: "\u200b",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Open in Ernest", url: ernestUrl }],
        [{ text: "View on Funda", url: listing.url }],
      ],
    },
  });

  return "completed";
}
