import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import path from "path";
import health from "./routes/health";
import geodata from "./routes/geodata";

const app = new Hono();

// CORS in development only
if (process.env.NODE_ENV !== "production") {
  app.use("/api/*", cors());
}

// API routes
app.route("/api", health);
app.route("/api", geodata);

// Serve frontend static files in production
const distDir = path.resolve(import.meta.dir, "../../frontend/dist");

app.use(
  "/*",
  serveStatic({
    root: distDir,
    rewriteRequestPath: (p) => p,
  })
);

// SPA fallback: serve index.html for non-file routes
app.use(
  "/*",
  serveStatic({
    root: distDir,
    rewriteRequestPath: () => "/index.html",
  })
);

const port = parseInt(process.env.PORT || "3000", 10);

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on http://localhost:${port}`);
