import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import path from "path";
import health from "./routes/health";
import geodata, { loadData } from "./routes/geodata";
import auth from "./routes/auth";
import { initDb } from "./db";

const app = new Hono();

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

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// API routes
app.route("/api", health);
app.route("/api", geodata);
app.route("/api/auth", auth);

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
