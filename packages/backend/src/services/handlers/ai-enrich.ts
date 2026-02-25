import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ANTHROPIC_API_KEY } from "@/config";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return client;
}

export async function handleAiEnrich(job: Job): Promise<"completed" | "skipped"> {
  const anthropic = getClient();
  if (!anthropic) return "skipped";

  // Fetch listing
  const rows = await db
    .select({
      fundaId: listings.fundaId,
      address: listings.address,
      price: listings.price,
      livingArea: listings.livingArea,
      bedrooms: listings.bedrooms,
      energyLabel: listings.energyLabel,
      constructionYear: listings.constructionYear,
      description: listings.description,
      photos: listings.photos,
      aiSummary: listings.aiSummary,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  // Already enriched
  if (listing.aiSummary !== null) return "skipped";

  // Build message content
  const content: Anthropic.MessageCreateParams["messages"][number]["content"] = [];

  // Photo blocks (up to 20)
  const photos = listing.photos ?? [];
  const photosToSend = photos.slice(0, 20);
  for (const url of photosToSend) {
    content.push({
      type: "image",
      source: { type: "url", url },
    });
  }

  // Structured data
  const structuredData = [
    `Address: ${listing.address}`,
    `Price: \u20AC${listing.price.toLocaleString("nl-NL")}`,
    `Living area: ${listing.livingArea} m\u00B2`,
    `Bedrooms: ${listing.bedrooms}`,
    listing.energyLabel ? `Energy label: ${listing.energyLabel}` : null,
    listing.constructionYear ? `Construction year: ${listing.constructionYear}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  content.push({
    type: "text",
    text: `Property details:\n${structuredData}`,
  });

  // Raw description
  if (listing.description) {
    content.push({
      type: "text",
      text: `Original listing description (in Dutch):\n${listing.description}`,
    });
  }

  // Prompt
  content.push({
    type: "text",
    text: `Analyze this Dutch real estate listing and respond with a JSON object containing exactly two fields:

1. "aiSummary": 1-2 sentences highlighting key features, required work, standout aspects. Be factual and concise. Note both positives and negatives.
2. "aiDescription": The original description translated to English. Clean up formatting (remove ALL-CAPS, extra whitespace). Remove marketing fluff. Keep all factual content.

Respond ONLY with the JSON object, no markdown fences or other text.`,
  });

  const response = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system:
        "You analyze Dutch real estate listings. You respond ONLY with valid JSON, no markdown fences.",
      messages: [{ role: "user", content }],
    },
    { timeout: 30_000 },
  );

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in AI response");
  }

  const parsed: unknown = JSON.parse(textBlock.text);

  // Runtime validate (no type assertions)
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("aiSummary" in parsed) ||
    !("aiDescription" in parsed)
  ) {
    throw new Error("Invalid AI response shape: missing required fields");
  }

  // After in-checks, TypeScript narrows the type
  const summaryVal = parsed.aiSummary;
  const descVal = parsed.aiDescription;
  if (typeof summaryVal !== "string" || typeof descVal !== "string") {
    throw new Error("Invalid AI response: fields must be strings");
  }

  const aiSummary = summaryVal.slice(0, 500);
  const aiDescription = descVal.slice(0, 10_000);

  await db
    .update(listings)
    .set({ aiSummary, aiDescription, updatedAt: sql`now()` })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
