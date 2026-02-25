import { Hono } from "hono";
import { eq, and, lt, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { db } from "../db";
import { users, credentials, challenges } from "../db/schema";
import {
  signToken,
  setTokenCookie,
  clearTokenCookie,
  setChallengeCookie,
  clearChallengeCookie,
  getTokenFromCookie,
  getChallengeIdFromCookie,
  verifyToken,
} from "../auth/jwt";
import {
  generateRegOptions,
  verifyRegResponse,
  generateAuthOptions,
  verifyAuthResponse,
} from "../auth/webauthn";
import { csrfCheck } from "../auth/middleware";

const auth = new Hono<AppEnv>();

// Rate limiting state (per-IP, in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Clean up expired rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW);

// Clean up expired challenges periodically
setInterval(async () => {
  await db
    .delete(challenges)
    .where(lt(challenges.expiresAt, sql`now()`))
    .catch(() => {});
}, 60_000);

// CSRF on all mutating auth endpoints
auth.use("/*", csrfCheck);

// POST /auth/register/options
auth.post("/register/options", async (c) => {
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const body = await c.req.json<{ username?: string }>();
  const username = body.username?.trim();

  if (!username) {
    return c.json({ error: "username required" }, 400);
  }
  if (username.length > 64) {
    return c.json({ error: "username must be ≤64 chars" }, 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return c.json({ error: "username must be alphanumeric (with _ or -)" }, 400);
  }

  // Check username availability
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Username already taken" }, 409);
  }

  // Generate a WebAuthn user ID (random bytes, base64url-encoded for storage)
  const userIdBytes = new Uint8Array(32);
  crypto.getRandomValues(userIdBytes);

  const options = await generateRegOptions({
    userName: username,
    userID: userIdBytes,
  });

  // Store challenge server-side
  const challengeId = crypto.randomUUID();
  const webauthnUserId = bufferToBase64url(userIdBytes);
  await db.insert(challenges).values({
    id: challengeId,
    challenge: options.challenge,
    type: "registration",
    metadata: { username, webauthnUserId },
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  setChallengeCookie(c, challengeId);
  return c.json(options);
});

// POST /auth/register/verify
auth.post("/register/verify", async (c) => {
  const challengeId = getChallengeIdFromCookie(c);
  if (!challengeId) {
    return c.json({ error: "No challenge cookie" }, 400);
  }

  // Look up and delete challenge atomically
  const [challenge] = await db
    .delete(challenges)
    .where(
      and(
        eq(challenges.id, challengeId),
        eq(challenges.type, "registration"),
        lt(sql`now()`, challenges.expiresAt),
      ),
    )
    .returning({
      challenge: challenges.challenge,
      metadata: challenges.metadata,
    });
  if (!challenge) {
    return c.json({ error: "Challenge expired or invalid" }, 400);
  }

  clearChallengeCookie(c);

  // Drizzle auto-deserializes JSONB — validate at runtime
  const meta = challenge.metadata;
  const metaUsername = typeof meta?.username === "string" ? meta.username : undefined;
  const metaWebauthnUserId =
    typeof meta?.webauthnUserId === "string" ? meta.webauthnUserId : undefined;
  if (!metaUsername || !metaWebauthnUserId) {
    return c.json({ error: "Invalid challenge metadata" }, 400);
  }

  const body = await c.req.json();
  let verification;
  try {
    verification = await verifyRegResponse({
      response: body,
      expectedChallenge: challenge.challenge,
    });
  } catch (e) {
    return c.json(
      {
        error: "Verification failed",
        detail: process.env.NODE_ENV !== "production" ? String(e) : undefined,
      },
      400,
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "Verification failed" }, 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Re-check username (race condition guard)
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, metaUsername))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const userId = crypto.randomUUID();
  const transports = credential.transports || [];

  // Insert user + credential in transaction
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      username: metaUsername,
      webauthnUserId: metaWebauthnUserId,
    });
    await tx.insert(credentials).values({
      id: credential.id,
      userId,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports,
    });
  });

  const token = await signToken({
    id: userId,
    username: metaUsername,
  });
  setTokenCookie(c, token);

  return c.json({
    verified: true,
    user: {
      id: userId,
      username: metaUsername,
    },
  });
});

// POST /auth/login/options
auth.post("/login/options", async (c) => {
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  // Discoverable credential flow — no allowCredentials needed
  const options = await generateAuthOptions({ allowCredentials: [] });

  const challengeId = crypto.randomUUID();
  await db.insert(challenges).values({
    id: challengeId,
    challenge: options.challenge,
    type: "authentication",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  setChallengeCookie(c, challengeId);
  return c.json(options);
});

// POST /auth/login/verify
auth.post("/login/verify", async (c) => {
  const challengeId = getChallengeIdFromCookie(c);
  if (!challengeId) {
    return c.json({ error: "No challenge cookie" }, 400);
  }

  const [challenge] = await db
    .delete(challenges)
    .where(
      and(
        eq(challenges.id, challengeId),
        eq(challenges.type, "authentication"),
        lt(sql`now()`, challenges.expiresAt),
      ),
    )
    .returning({ challenge: challenges.challenge });
  if (!challenge) {
    return c.json({ error: "Challenge expired or invalid" }, 400);
  }

  clearChallengeCookie(c);

  const body = await c.req.json();
  const credentialId = body.id;
  if (!credentialId) {
    return c.json({ error: "Missing credential ID" }, 400);
  }

  // Look up credential with join
  const [cred] = await db
    .select({
      id: credentials.id,
      publicKey: credentials.publicKey,
      counter: credentials.counter,
      transports: credentials.transports,
      userId: users.id,
      username: users.username,
    })
    .from(credentials)
    .innerJoin(users, eq(credentials.userId, users.id))
    .where(eq(credentials.id, credentialId));
  if (!cred) {
    return c.json({ error: "Credential not found" }, 400);
  }

  let verification;
  try {
    verification = await verifyAuthResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      credential: {
        id: cred.id,
        publicKey: cred.publicKey,
        counter: cred.counter,
        transports: cred.transports || undefined,
      },
    });
  } catch (e) {
    return c.json(
      {
        error: "Verification failed",
        detail: process.env.NODE_ENV !== "production" ? String(e) : undefined,
      },
      400,
    );
  }

  if (!verification.verified) {
    return c.json({ error: "Verification failed" }, 400);
  }

  // Update counter
  const { authenticationInfo } = verification;
  await db
    .update(credentials)
    .set({ counter: authenticationInfo.newCounter })
    .where(eq(credentials.id, credentialId));

  const token = await signToken({
    id: cred.userId,
    username: cred.username,
  });
  setTokenCookie(c, token);

  return c.json({
    verified: true,
    user: {
      id: cred.userId,
      username: cred.username,
    },
  });
});

// POST /auth/logout
auth.post("/logout", (c) => {
  clearTokenCookie(c);
  return c.json({ ok: true });
});

// GET /auth/me
auth.get("/me", async (c) => {
  const token = getTokenFromCookie(c);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const payload = await verifyToken(token);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);

  return c.json({
    id: payload.sub,
    username: payload.username,
  });
});

function bufferToBase64url(buf: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buf));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default auth;
