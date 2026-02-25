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

  content.push({
    type: "text",
    text: "Analyze this Dutch real estate listing.",
  });

  const response = await anthropic.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system:
        "You analyze Dutch real estate listings. For aiSummary: write 1-2 sentences highlighting key features, required work, standout aspects. Be factual and concise. Note both positives and negatives. For aiDescription: translate the original description to English, clean up formatting (remove ALL-CAPS, extra whitespace), remove marketing fluff, keep all factual content.",
      messages: [{ role: "user", content }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              aiSummary: { type: "string" },
              aiDescription: { type: "string" },
            },
            required: ["aiSummary", "aiDescription"],
            additionalProperties: false,
          },
        },
      },
    },
    { timeout: 30_000 },
  );

  // With json_schema output, the response is a text block with guaranteed-valid JSON
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in AI response");
  }

  const parsed: unknown = JSON.parse(textBlock.text);

  // Runtime validate
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("aiSummary" in parsed) ||
    !("aiDescription" in parsed)
  ) {
    throw new Error("Invalid AI response shape: missing required fields");
  }

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
