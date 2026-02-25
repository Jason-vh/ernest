import { Hono } from "hono";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import path from "path";
import health from "@/routes/health";
import geodata, { loadData } from "@/routes/geodata";
import auth from "@/routes/auth";
import listingsRouter from "@/routes/listings";
import { initDb } from "@/db";
import { resetStaleJobs, enqueueMany } from "@/services/job-queue";
import { startQueueProcessor } from "@/services/queue-processor";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { isNull, and } from "drizzle-orm";

const app = new Hono();

// Compress API responses
app.use("/api/*", compress());

// Security headers
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);

// CORS in development only
if (process.env.NODE_ENV !== "production") {
  app.use(
    "/api/*",
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    }),
  );
}

// Run migrations and load data before accepting requests
await initDb();
await loadData();

// Recover any stale running jobs from previous crash
await resetStaleJobs();

// Enqueue AI enrichment for existing un-enriched listings (idempotent)
const unenriched = await db
  .select({ fundaId: listings.fundaId })
  .from(listings)
  .where(and(isNull(listings.aiPositives), isNull(listings.disappearedAt)));
if (unenriched.length > 0) {
  const enqueued = await enqueueMany(
    unenriched.map((r) => ({ type: "ai-enrich" as const, fundaId: r.fundaId, maxAttempts: 2 })),
  );
  if (enqueued > 0) {
    console.log(`Enqueued ${enqueued} AI enrichment jobs for existing listings`);
  }
}

// Start background job queue processor
startQueueProcessor();

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// API routes
app.route("/api", health);
app.route("/api", geodata);
app.route("/api/auth", auth);
app.route("/api/listings", listingsRouter);

// Serve frontend static files in production
const distDir = path.resolve(import.meta.dir, "../../frontend/dist");

app.use(
  "/*",
  serveStatic({
    root: distDir,
    rewriteRequestPath: (p) => p,
  }),
);

// SPA fallback: serve index.html for non-file routes
app.use(
  "/*",
  serveStatic({
    root: distDir,
    rewriteRequestPath: () => "/index.html",
  }),
);

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
