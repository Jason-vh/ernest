import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { getTokenFromCookie, verifyToken } from "./jwt";

/**
 * Requires a valid JWT. Sets c.get("user") or returns 401.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getTokenFromCookie(c);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const payload = await verifyToken(token);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);

  c.set("user", {
    sub: payload.sub,
    username: payload.username,
  });
  await next();
};

/**
 * Optionally sets c.get("user") if valid JWT present. Never rejects.
 */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getTokenFromCookie(c);
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      c.set("user", {
        sub: payload.sub,
        username: payload.username,
      });
    }
  }
  await next();
};

/**
 * CSRF protection: checks Origin header on mutating requests.
 * In production, Origin must match ORIGIN env var.
 * In dev, allows localhost origins.
 */
export const csrfCheck: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  const origin = c.req.header("Origin");
  if (!origin) {
    return c.json({ error: "Missing Origin header" }, 403);
  }

  const allowedOrigin = process.env.ORIGIN || "http://localhost:5173";
  if (origin !== allowedOrigin) {
    // In dev, also allow the backend origin
    const devBackend = "http://localhost:3000";
    if (process.env.NODE_ENV !== "production" && origin === devBackend) {
      return next();
    }
    return c.json({ error: "Origin mismatch" }, 403);
  }

  await next();
};
