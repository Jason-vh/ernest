import { sign, verify } from "hono/jwt";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { JWTPayload } from "hono/utils/jwt/types";
import type { Context } from "hono";
import { JWT_SECRET } from "../config";

const TOKEN_COOKIE = "ernest_token";
const CHALLENGE_COOKIE = "ernest_challenge";
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const FIVE_MINUTES = 5 * 60;

const secure = process.env.NODE_ENV === "production";

interface ErnestJwtPayload extends JWTPayload {
  sub: string;
  username: string;
  exp: number;
}

function isErnestPayload(p: JWTPayload): p is ErnestJwtPayload {
  return typeof p.sub === "string" && typeof p.username === "string";
}

export async function signToken(user: {
  id: string;
  username: string;
}): Promise<string> {
  const payload: ErnestJwtPayload = {
    sub: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS,
  };
  return sign(payload, JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<ErnestJwtPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    if (!isErnestPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setTokenCookie(c: Context, token: string) {
  setCookie(c, TOKEN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export function clearTokenCookie(c: Context) {
  deleteCookie(c, TOKEN_COOKIE, { path: "/", secure });
}

export function setChallengeCookie(c: Context, challengeId: string) {
  setCookie(c, CHALLENGE_COOKIE, challengeId, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: FIVE_MINUTES,
  });
}

export function clearChallengeCookie(c: Context) {
  deleteCookie(c, CHALLENGE_COOKIE, { path: "/api/auth", secure });
}

export function getTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, TOKEN_COOKIE);
}

export function getChallengeIdFromCookie(c: Context): string | undefined {
  return getCookie(c, CHALLENGE_COOKIE);
}
