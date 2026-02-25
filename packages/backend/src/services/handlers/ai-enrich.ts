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
      aiPositives: listings.aiPositives,
      buurtWozValue: listings.buurtWozValue,
      buurtSafetyRating: listings.buurtSafetyRating,
      buurtCrimesPer1000: listings.buurtCrimesPer1000,
      buurtOwnerOccupiedPct: listings.buurtOwnerOccupiedPct,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  // Already enriched
  if (listing.aiPositives !== null) return "skipped";

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
    listing.buurtWozValue
      ? `Neighbourhood avg WOZ value: \u20AC${listing.buurtWozValue.toLocaleString("nl-NL")}`
      : null,
    listing.buurtSafetyRating
      ? `Neighbourhood safety rating: ${listing.buurtSafetyRating}/10`
      : null,
    listing.buurtCrimesPer1000
      ? `Neighbourhood crimes per 1000 residents: ${listing.buurtCrimesPer1000}`
      : null,
    listing.buurtOwnerOccupiedPct
      ? `Neighbourhood owner-occupied: ${listing.buurtOwnerOccupiedPct}%`
      : null,
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
        "You analyze Dutch real estate listings. For positives: list standout good things about this property as short phrases (e.g. 'south-facing garden', 'recently renovated bathroom'). For negatives: list downsides, required work, or concerns as short phrases (e.g. 'needs new kitchen', 'ground floor - no elevator'). Never mention size/area, energy label, price, or number of bedrooms in positives or negatives — these are already shown in the UI. 3-5 bullets each. For aiDescription: translate the description to English, strip ALL marketing fluff and sales language (rhetorical questions, exclamations, 'can you see yourself living here', 'come in soon', etc.). Keep only factual information: room layout, finishes, orientation, outdoor space, parking, building facilities, transport links. Be concise — just the facts.",
      messages: [{ role: "user", content }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              positives: {
                type: "array",
                items: { type: "string" },
              },
              negatives: {
                type: "array",
                items: { type: "string" },
              },
              aiDescription: { type: "string" },
            },
            required: ["positives", "negatives", "aiDescription"],
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
    !("positives" in parsed) ||
    !("negatives" in parsed) ||
    !("aiDescription" in parsed)
  ) {
    throw new Error("Invalid AI response shape: missing required fields");
  }

  const posVal = parsed.positives;
  const negVal = parsed.negatives;
  const descVal = parsed.aiDescription;

  if (!Array.isArray(posVal) || !Array.isArray(negVal) || typeof descVal !== "string") {
    throw new Error("Invalid AI response: unexpected field types");
  }

  const aiPositives = posVal.filter((s): s is string => typeof s === "string").slice(0, 8);
  const aiNegatives = negVal.filter((s): s is string => typeof s === "string").slice(0, 8);
  const aiDescription = descVal.slice(0, 10_000);

  await db
    .update(listings)
    .set({ aiPositives, aiNegatives, aiDescription, updatedAt: sql`now()` })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
