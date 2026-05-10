import { createHash } from "node:crypto";
import { ANTHROPIC_API_KEY } from "@/config";
import type { Listing as DbListing } from "@/db/schema";
import type { ListingCatchConcern, ListingCatchSeverity } from "@ernest/shared";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const PHOTO_CAP = 60;

/**
 * Anthropic enforces a 2000-pixel max dimension when sending many images.
 * Funda originals are larger (e.g. 2160×1439), so we route every photo through
 * weserv.nl, a free image-proxy/resize CDN. Anthropic fetches the resized
 * variant directly. The proxy doesn't enlarge smaller images, and `fit=inside`
 * preserves aspect ratio without cropping.
 */
const RESIZE_LONG_EDGE = 1500;

function resizedPhotoUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//, "");
  const encoded = encodeURIComponent(stripped);
  return `https://images.weserv.nl/?url=${encoded}&w=${RESIZE_LONG_EDGE}&h=${RESIZE_LONG_EDGE}&fit=inside&output=jpg`;
}

const SYSTEM_PROMPT = `You review Funda listings on behalf of a buyer who is NOT the agent's customer. The agent is selling. You are not.

Your job: surface concerns the buyer might miss when scrolling. Focus on what the listing implies but does not say outright. Do not restate positives. Do not narrate the listing.

Discipline:
- Every concern must cite an observable detail: a specific photo, a specific phrase in the description, or a specific data point.
- If you cannot point to evidence, do not flag it.
- An empty array is the correct answer when nothing is genuinely concerning. Do not pad.
- Calibrate severity:
  - high: material to a buying decision (e.g. pre-1970 building with no foundation history mentioned, or photos suggest extensive damp damage)
  - medium: worth investigating before bidding (e.g. kitchen photo only shows one corner; energy label F with no renovation noted)
  - low: worth noting (e.g. no daylight photo of the living room; description omits floor on multi-storey building)
  If everything you flag is medium, recalibrate.

Dutch listing copy often uses words that mask concerns. When you encounter them, reason about what specific concern they may be hiding rather than treating them at face value. Do not mechanically flag them — only flag if the surrounding context suggests the concern is real.

Each flag is one sentence in plain English, naming the specific evidence. The buyer is reading on a phone — be terse.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    concerns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          flag: { type: "string" },
        },
        required: ["severity", "flag"],
        additionalProperties: false,
      },
    },
  },
  required: ["concerns"],
  additionalProperties: false,
} as const;

/**
 * Compute a hash that changes when any input the model sees changes.
 * Used to skip re-analysis when nothing material has changed.
 */
export function hashCatchSource(listing: DbListing): string {
  const photoUrls = (listing.photos ?? []).slice(0, PHOTO_CAP);
  const parts = [
    listing.description ?? "",
    listing.descriptionEn ?? "",
    photoUrls.join("|"),
    String(listing.price),
    String(listing.bedrooms),
    String(listing.livingArea),
    listing.energyLabel ?? "",
    String(listing.constructionYear ?? ""),
    listing.ownership ?? "",
    String(listing.vveCostsMonthly ?? ""),
    String(listing.erfpachtCostsMonthly ?? ""),
    listing.status,
    listing.offeredSince ?? "",
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function daysOnMarket(offeredSince: string | null): number | null {
  if (!offeredSince) return null;
  const offered = new Date(offeredSince);
  if (Number.isNaN(offered.getTime())) return null;
  return Math.floor((Date.now() - offered.getTime()) / (1000 * 60 * 60 * 24));
}

function buildContextBlock(listing: DbListing): string {
  const lines: string[] = [];
  lines.push(`Address: ${listing.address}`);
  if (listing.neighbourhood || listing.city) {
    lines.push(`Area: ${[listing.neighbourhood, listing.city].filter(Boolean).join(", ")}`);
  }
  lines.push(`Asking price: €${listing.price.toLocaleString("nl-NL")}`);
  lines.push(`Living area: ${listing.livingArea} m²`);
  lines.push(`Bedrooms: ${listing.bedrooms}`);
  lines.push(
    `Construction year: ${listing.constructionYear != null ? String(listing.constructionYear) : "not provided"}`,
  );
  lines.push(`Energy label: ${listing.energyLabel ?? "not provided"}`);
  if (listing.ownership) lines.push(`Ownership: ${listing.ownership}`);
  if (listing.vveCostsMonthly != null) lines.push(`VvE monthly: €${listing.vveCostsMonthly}`);
  if (listing.erfpachtCostsMonthly != null) {
    lines.push(`Erfpacht monthly: €${listing.erfpachtCostsMonthly}`);
  }
  if (listing.hasGarden) lines.push("Garden: yes");
  if (listing.hasBalcony) lines.push("Balcony: yes");
  if (listing.hasRoofTerrace) lines.push("Roof terrace: yes");
  if (listing.wozValue != null)
    lines.push(`WOZ value: €${listing.wozValue.toLocaleString("nl-NL")}`);
  if (listing.buurtWozValue != null) {
    lines.push(`Buurt avg WOZ: €${listing.buurtWozValue.toLocaleString("nl-NL")}`);
  }
  if (listing.buurtSafetyRating != null) {
    lines.push(`Buurt safety: ${listing.buurtSafetyRating}/10`);
  }
  if (listing.buurtCrimesPer1000 != null) {
    lines.push(`Buurt crimes per 1000: ${listing.buurtCrimesPer1000}`);
  }
  lines.push(`Status: ${listing.status}`);
  if (listing.offeredSince) {
    const days = daysOnMarket(listing.offeredSince);
    lines.push(
      `Offered since: ${listing.offeredSince}${days != null ? ` (${days} days on market)` : ""}`,
    );
  }

  const description = listing.descriptionEn?.trim() || listing.description?.trim() || "";
  return [
    "Listing data:",
    lines.join("\n"),
    "",
    "Description:",
    description || "(no description provided)",
  ].join("\n");
}

interface AnthropicMessageBlock {
  type: string;
}

interface AnthropicTextBlock extends AnthropicMessageBlock {
  type: "text";
  text: string;
}

function isTextBlock(block: unknown): block is AnthropicTextBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    (block as { type: unknown }).type === "text" &&
    "text" in block &&
    typeof (block as { text: unknown }).text === "string"
  );
}

function parseConcerns(payload: unknown): ListingCatchConcern[] {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Anthropic response is not an object");
  }
  if (!("concerns" in payload) || !Array.isArray((payload as { concerns: unknown }).concerns)) {
    throw new Error("Anthropic response missing concerns array");
  }
  const items = (payload as { concerns: unknown[] }).concerns;
  const out: ListingCatchConcern[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const sev = (item as { severity?: unknown }).severity;
    const flag = (item as { flag?: unknown }).flag;
    if (typeof flag !== "string" || flag.trim() === "") continue;
    if (sev !== "low" && sev !== "medium" && sev !== "high") continue;
    out.push({ severity: sev as ListingCatchSeverity, flag: flag.trim() });
  }
  return out;
}

export async function analyzeListingCatch(listing: DbListing): Promise<ListingCatchConcern[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const photos = (listing.photos ?? []).slice(0, PHOTO_CAP);

  const userContent: unknown[] = photos.map((url) => ({
    type: "image",
    source: { type: "url", url: resizedPhotoUrl(url) },
  }));
  userContent.push({ type: "text", text: buildContextBlock(listing) });

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      output_config: {
        format: {
          type: "json_schema",
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null || !("content" in json)) {
    throw new Error("Anthropic response missing content");
  }
  const content = (json as { content: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("Anthropic response content is empty");
  }
  const textBlock = content.find(isTextBlock);
  if (!textBlock) {
    throw new Error("Anthropic response missing text block");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(`Anthropic returned non-JSON text: ${textBlock.text.slice(0, 200)}`);
  }

  return parseConcerns(parsed);
}
