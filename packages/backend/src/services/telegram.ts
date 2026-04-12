import { TELEGRAM_BOT_TOKEN } from "@/config";

export class TelegramRateLimitError extends Error {
  retryAfterSec: number;

  constructor(method: string, retryAfterSec: number, responseText: string) {
    super(`Telegram ${method} failed (429): ${responseText}`);
    this.name = "TelegramRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

function extractRetryAfterSec(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("parameters" in body)) return null;

  const parameters = body.parameters;
  if (typeof parameters !== "object" || parameters === null) return null;
  if (!("retry_after" in parameters)) return null;

  const retryAfter = parameters.retry_after;
  if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter)) return null;

  return Math.max(1, Math.ceil(retryAfter));
}

export async function telegramApi(method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const retryAfterSec = extractRetryAfterSec(parsed);
    if (res.status === 429 && retryAfterSec !== null) {
      throw new TelegramRateLimitError(method, retryAfterSec, text);
    }

    throw new Error(`Telegram ${method} failed (${res.status}): ${text}`);
  }
  return res.json();
}
