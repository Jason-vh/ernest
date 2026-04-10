function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const DATABASE_URL = required("DATABASE_URL");
export const JWT_SECRET = required("JWT_SECRET");
export const ORIGIN = required("ORIGIN");
export const RP_ID = required("RP_ID");

export const REFRESH_SECRET = required("REFRESH_SECRET");

export const TELEGRAM_BOT_TOKEN = null; // Disabled by agent
export const TELEGRAM_CHAT_ID = null; // Disabled by agent
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? null;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? null;
