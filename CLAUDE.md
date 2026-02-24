# CLAUDE.md

## Project overview

Ernest is an Amsterdam house-hunting map. Bun monorepo with Vue 3 frontend and Hono backend. Static geodata is precomputed and served from disk. Funda listings refresh hourly via a Railway cron service.

## Commands

```sh
bun install              # Install all workspace deps
bun run dev:backend      # Start Hono server on :3000
bun run dev:frontend     # Start Vite dev server on :5173 (proxies /api -> :3000)
bun run build            # Build Vue frontend to packages/frontend/dist/
bun run start            # Production: Hono serves API + frontend on :3000
bun run db:generate      # Generate Drizzle migration from schema changes
bun run db:push          # Push schema directly to DB (dev shortcut)
bun run db:studio        # Open Drizzle Studio (DB browser)
bun run fetch-data       # Refetch isochrones + stations + buurten + funda from APIs
bun run fetch-funda      # Run Funda fetch standalone (python3.13)
```

## Architecture

- **Monorepo**: Bun workspaces (`packages/*`, `scripts`)
- **Frontend** (`packages/frontend`): Vue 3 + Vite + TypeScript. Single-page app with MapLibre GL JS map.
- **Backend** (`packages/backend`): Bun + Hono + Drizzle ORM + PostgreSQL. Serves precomputed data as JSON endpoints and the built frontend via `serveStatic`. Auth uses passkeys (WebAuthn) with JWT sessions. All file paths resolved via `import.meta.dir` (never relative to CWD). Database schema defined in Drizzle (`src/db/schema.ts`), migrations in `drizzle/`, applied automatically on startup.
- **Scripts** (`scripts/`): `fetch-data.ts` runs with Bun to precompute geodata (uses Turf.js for spatial operations). `fetch_funda.py` is a thin wrapper that imports shared Funda logic from `services/funda-cron/funda_core.py` and outputs GeoJSON to stdout (called by `fetch-data.ts` via `Bun.spawn`).
- **Cron** (`services/funda-cron/`): Python service that fetches Funda listings hourly and POSTs them to the backend's `POST /api/internal/refresh-funda` endpoint. Runs as a separate Railway cron service, communicates via Railway internal networking. Core fetch/filter/enrich logic lives in `funda_core.py`, shared with the local script.
- **Data** (`packages/backend/data/`): Static JSON/GeoJSON files. Funda data is also persisted to a Railway volume (`/data/funda.geojson`) and loaded from there on startup if available, falling back to bundled data.

## Key files

- `packages/frontend/src/components/MapView.vue` — All map layers, sources, and interactions
- `packages/frontend/src/geo/greyscale-style.ts` — Transforms OpenFreeMap bright style to greyscale (preserves parks/water). Controls which base map layers are hidden via `HIDDEN_LAYERS`.
- `packages/frontend/src/geo/constants.ts` — Office coordinates, map center, default zoom
- `packages/backend/src/db/schema.ts` — Drizzle table definitions (users, credentials, challenges)
- `packages/backend/src/config.ts` — Required env var validation (DATABASE_URL, JWT_SECRET, ORIGIN, RP_ID)
- `packages/backend/src/routes/auth.ts` — WebAuthn registration/login flows, JWT session management
- `packages/backend/src/routes/geodata.ts` — API endpoints for isochrone, stations, lines, buurten, funda + POST /internal/refresh-funda
- `services/funda-cron/funda_core.py` — Shared Funda logic: fetch, filter, enrich with coordinates, convert to GeoJSON. Searches Amsterdam, Diemen, Duivendrecht, Amstelveen, Ouderkerk aan de Amstel. Filters: €450k–€600k, ≥2 bed, ≥65 m², energy label ≥ D or unknown, status "Beschikbaar" only. Per-area error handling so one failure doesn't stop the rest.
- `services/funda-cron/fetch_and_push.py` — Cron job: calls `funda_core.fetch_and_build_geojson()` and POSTs result to backend
- `scripts/fetch-data.ts` — Data precomputation pipeline (Valhalla + Overpass + Amsterdam BBGA + Funda + Turf)
- `scripts/fetch_funda.py` — Thin wrapper: imports from `funda_core`, outputs GeoJSON to stdout for `fetch-data.ts`

## Conventions

- TypeScript throughout with `strict: true` (both frontend and backend have tsconfigs)
- **No type assertions** (`as`, `!`) — use runtime narrowing (type guards, `typeof` checks) instead
- No test framework set up yet
- Shared types in `packages/frontend/src/types/transit.ts` (StopType enum, TransitStop interface) and `packages/frontend/src/types/buurt.ts` (BuurtProperties interface)
- Office locations defined in both `scripts/fetch-data.ts` and `packages/frontend/src/geo/constants.ts` — keep in sync if changed
- Transit line colors: train=#003DA5 (OV blue), metro=#E4003A (red), tram=#7B2D8E (purple), funda=#E8950F (amber)
- Funda overbid price shown at 115% of list price in popup
- Vite config uses `target: "esnext"` for both optimizeDeps and build (required for MapLibre GL)

## Deployment

- **Hosting**: Railway (two services). Config in `railway.toml` (web service only).
- **URL**: https://ernest.vanhattum.xyz
- **Web service** (`ernest-web`): Railpack detects `bun.lock`, installs Bun, runs `bun install && bun run build`, then `bun run start`. Health check hits `/api/health`. Has a 1 GB volume mounted at `/data` for persisted Funda data.
- **Cron service** (`ernest-cron`): Dockerfile-based Python service. Root directory `services/funda-cron`. Runs on schedule `0 * * * *` (hourly). Communicates with web service via Railway internal networking (`http://ernest.railway.internal:8080`).
- **Env vars on web service**: `DATABASE_URL` (references `ernest-db`), `JWT_SECRET`, `ORIGIN=https://ernest.vanhattum.xyz`, `RP_ID=ernest.vanhattum.xyz`, `NODE_ENV=production`, `REFRESH_SECRET`, `VOLUME_PATH=/data`. `PORT` is auto-set by Railway. All four auth vars (`DATABASE_URL`, `JWT_SECRET`, `ORIGIN`, `RP_ID`) are required — server refuses to start without them.
- **Env vars on cron service**: `REFRESH_SECRET` (same value), `REFRESH_URL=http://ernest.railway.internal:8080/api/internal/refresh-funda`.
- **Database** (`ernest-db`): Railway-managed PostgreSQL. Connected to web service via internal networking. Drizzle migrations run on startup.
- **Auto-deploy**: GitHub repo connected for deploy-on-push to `main`.

## External APIs (used by fetch-data script only)

- **Valhalla** (`valhalla1.openstreetmap.de`): Cycling isochrones and route queries. Isochrones are augmented with ferry supplements for Amsterdam Noord — the script computes cycling time to the Buiksloterweg ferry via `/route`, then fetches supplementary isochrones from the north landing with the remaining time budget, unioning them with `@turf/union`. Rate-limited — add delays between requests.
- **Overpass** (`overpass.kumi.systems`): Transit stops and lines from OSM. Rate-limited — make requests sequential with delays.
- **Amsterdam BBGA** (`api.data.amsterdam.nl`): Neighbourhood boundaries (`/v1/gebieden/buurten`) and statistics (`/v1/bbga/kerncijfers`). Free, no auth. Produces `buurten.geojson` — neighbourhood polygons with WOZ value, owner-occupied %, safety rating, and crime rate properties.
- **Funda** (via [pyfunda](https://github.com/0xMH/pyfunda)): Property listings from Funda's mobile API. Requires `pip install pyfunda` (Python 3.13). Search results don't include coordinates — the script fetches individual listing details in parallel (8 workers) to get lat/lng and photo URLs. The `characteristics['Status']` field from detail pages is the reliable source for listing status (the top-level `status` field always says "available").
