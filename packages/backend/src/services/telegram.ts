import { TELEGRAM_BOT_TOKEN } from "@/config";

export async function telegramApi(method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${method} failed (${res.status}): ${text}`);
  }
  return res.json();
}
