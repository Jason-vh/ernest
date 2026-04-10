import { createHash } from "node:crypto";
import { ANTHROPIC_API_KEY } from "@/config";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const SYSTEM_PROMPT = `You translate Dutch real-estate listing descriptions into concise, natural English.

Rules:
- Preserve all concrete facts, caveats, dimensions, costs, ownership details, and condition notes.
- Remove obvious marketing fluff, repetition, and empty superlatives.
- Do not invent, infer, or embellish facts.
- Keep the tone neutral and factual.
- Keep paragraph breaks when they help readability.
- Return only the cleaned-up English description as plain text.
- Do not use markdown, bullets, quotes, or any prefatory text.`;

export function hasMeaningfulDescription(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hashDescription(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function extractTextContent(response: unknown): string {
  if (
    typeof response !== "object" ||
    response === null ||
    !("content" in response) ||
    !Array.isArray(response.content)
  ) {
    throw new Error("Anthropic response missing content array");
  }

  const parts: string[] = [];
  for (const block of response.content) {
    if (typeof block !== "object" || block === null) continue;
    if (!("type" in block) || block.type !== "text") continue;
    if (!("text" in block) || typeof block.text !== "string") continue;
    parts.push(block.text);
  }

  return parts.join("\n").trim();
}

export async function translateListingDescription(description: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Translate and lightly clean up this Funda listing description from Dutch to English. Keep all important factual details and caveats.\n\n${description}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const json: unknown = await response.json();
  const translated = extractTextContent(json);
  if (!translated) {
    throw new Error("Anthropic returned an empty translation");
  }

  return translated;
}
