import { createHash } from "node:crypto";
import { ANTHROPIC_API_KEY } from "@/config";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const SYSTEM_PROMPT = `You translate Dutch real-estate listing descriptions into concise, factual English.

Your job is not to preserve the sales tone. Your job is to preserve facts while removing estate-agent marketing language.

Rules:
- Preserve all concrete facts, caveats, dimensions, costs, rental terms, condition notes, layout details, and renovation information.
- Remove marketing fluff, hype, empty superlatives, lifestyle framing, and generic sales language.
- If a sentence contains no concrete information, delete it.
- If a sentence mixes facts with fluff, keep only the factual part.
- Do not invent, infer, soften, or embellish facts.
- Keep the tone neutral, plain, and matter-of-fact.
- Prefer short declarative sentences over polished brochure copy.
- Keep paragraph breaks only when they improve readability.
- Return only the cleaned English description as plain text.
- Do not use markdown, bullets, quotes, headings, or prefatory text.

Examples of language to remove rather than translate literally:
- "heerlijk", "prachtig", "sfeervol", "fantastisch", "toplocatie", "instapklaar", "must-see"
- generic claims like "this lovely home", "a unique opportunity", "you immediately feel at home"
- neighbourhood or lifestyle puffery unless it contains concrete facts (for example, keep actual distances or amenities, remove vague praise).`;

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
          content: `Translate this Dutch Funda listing description into English and aggressively strip marketing fluff. Keep factual details, caveats, layout information, costs, and condition notes. Delete sentences that are purely promotional.\n\n${description}`,
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
