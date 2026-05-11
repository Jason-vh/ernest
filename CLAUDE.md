# CLAUDE.md

## Project overview

Ernest is an Amsterdam rental-hunting map. Bun monorepo with Vue 3 frontend and Hono backend. Static geodata is precomputed and served from disk. Funda rental listings refresh hourly via a Railway cron service. Searches a 15 km radius around Amsterdam Centraal; filters to 2+ bedrooms with an energy label better than D.

## Commands

```sh
bun install              # Install all workspace deps
bun run dev:backend      # Start Hono server on :3000
bun run dev:frontend     # Start Vite dev server on :5173 (proxies /api -> :3000)
bun run build            # Build Vue frontend to packages/frontend/dist/
bun run start            # Production: Hono serves API + frontend on :3000
bun run check            # Check formatting (oxfmt) + lint (oxlint) in one command
bun run fmt              # Format all source files with oxfmt
bun run lint             # Lint with oxlint
bun run typecheck        # Type-check both frontend and backend (see note below)
bun run db:generate      # Generate Drizzle migration from schema changes
bun run db:push          # Push schema directly to DB (dev shortcut)
bun run db:studio        # Open Drizzle Studio (DB browser)
bun run fetch-data       # Refetch transit + buurten + funda-related static data from APIs
bun run fetch-transit    # Refetch train/metro/tram data (~40km around Amsterdam Centraal)
bun run fetch-funda      # Run Funda fetch standalone (python3.13)
bun run fetch-ferries    # Fetch ferry routes/stops from Overpass into data files
```

**Verification tips**: `bun run check` runs both format check and lint in one command (<1s). `bun run typecheck` uses `bunx` which can be flaky; if it fails with a GitHub 404, run each package directly instead: `cd packages/backend && bun x tsc --noEmit` and `cd packages/frontend && ./node_modules/.bin/vue-tsc --noEmit`.

## Architecture

- **Monorepo**: Bun workspaces (`packages/*`, `scripts`)
- **Frontend** (`packages/frontend`): Vue 3 + Vite + Tailwind CSS v4 + TypeScript. Single-page app with MapLibre GL JS map. Uses `@/` path alias (configured in both `tsconfig.json` and `vite.config.ts`). Styling uses Tailwind utilities with design tokens defined in `src/app.css` (`@theme` block) and a custom `glass` utility for glassmorphism panels.
- **Backend** (`packages/backend`): Bun + Hono + Drizzle ORM + PostgreSQL. Serves precomputed data as JSON endpoints and the built frontend via `serveStatic`. Auth uses passkeys (WebAuthn) with JWT sessions. All file paths resolved via `import.meta.dir` (never relative to CWD). Database schema defined in Drizzle (`src/db/schema.ts`), migrations in `drizzle/`, applied automatically on startup.
- **Scripts** (`scripts/`): `fetch-data.ts` runs with Bun to precompute geodata (uses Turf.js for spatial operations). `fetch_funda.py` is a thin wrapper that imports shared Funda logic from `services/funda-cron/funda_core.py` and outputs GeoJSON to stdout (called by `fetch-data.ts` via `Bun.spawn`).
- **Cron** (`services/funda-cron/`): Python service that fetches Funda listings hourly and POSTs them to the backend's `POST /api/internal/refresh-funda` endpoint. Runs as a separate Railway cron service, communicates via Railway internal networking. Core fetch/filter/enrich logic lives in `funda_core.py`, shared with the local script.
- **Data** (`packages/backend/data/`): Static JSON/GeoJSON files (stations, lines, buurten). Funda listings are stored in PostgreSQL (see `listings` table in schema).
- **Job queue**: Database-backed queue (`jobs` table) for background processing. Two job types: `telegram-notify` and `translate-description`. Queue processor runs on startup, polls continuously, processes jobs sequentially with rate limiting (1500ms between telegram-notify, 500ms between translate-description). Failed jobs retry with exponential backoff (30s, 120s, 480s). Jobs are only enqueued for **active** listings (status `"Beschikbaar"` or `""`, not disappeared).
- **AI enrichment**: Uses Claude Sonnet (`claude-sonnet-4-6`) for "what's the catch?" analysis on user-opened listings and Claude Haiku (`claude-haiku-4-5-20251001`) to translate Dutch descriptions to English. Requires `ANTHROPIC_API_KEY` env var — features are skipped if not set.

## Key files

### Frontend

- `packages/frontend/src/app.css` — Tailwind entry point: `@theme` design tokens, `glass` utility, full-height rules
- `packages/frontend/src/components/MapView.vue` — Map orchestrator (~75 lines): initializes map, fetches data, wires composables
- `packages/frontend/src/composables/useMap.ts` — Map instance creation + greyscale style loading
- `packages/frontend/src/composables/useOfficeMarkers.ts` — Office dot + label markers (exports `createLabel` reused by transit)
- `packages/frontend/src/composables/useIsochroneLayers.ts` — Zone fill/border layers + visibility/hover watchers
- `packages/frontend/src/composables/useTransitLayers.ts` — Transit line/circle layers + station label markers + watchers
- `packages/frontend/src/composables/useFundaLayer.ts` — Funda source/layers + new/viewed visibility watcher
- `packages/frontend/src/composables/useBuildingHighlightLayer.ts` — Building polygon matching + throttled viewport updates
- `packages/frontend/src/composables/useMapPopups.ts` — Funda popup creation + hover/click/touch handlers
- `packages/frontend/src/composables/useZoneState.ts` — Shared singleton: zone/transit/funda visibility, URL sync, localStorage
- `packages/frontend/src/composables/useBuildingHighlights.ts` — Pure function: matches buildings to funda features via point-in-polygon
- `packages/frontend/src/geo/greyscale-style.ts` — Transforms OpenFreeMap bright style to greyscale (preserves parks/water). Controls which base map layers are hidden via `HIDDEN_LAYERS`.
- `packages/frontend/src/geo/constants.ts` — Office coordinates, map center, default zoom, COLORS object
- `packages/frontend/src/geo/map-utils.ts` — `getGeoJSONSource()` runtime-safe helper (avoids `as` assertion)
- `packages/frontend/src/styles/funda-popup.css` — MapLibre popup style overrides (global, not scoped)

### Backend

- `packages/backend/src/db/schema.ts` — Drizzle table definitions (users, credentials, challenges, listings, jobs, reactions, notes)
- `packages/backend/src/config.ts` — Required env var validation (DATABASE_URL, JWT_SECRET, ORIGIN, RP_ID) + optional ANTHROPIC_API_KEY
- `packages/backend/src/routes/auth.ts` — WebAuthn registration/login flows, JWT session management
- `packages/backend/src/routes/geodata.ts` — API endpoints for stations, lines, buurten, funda + POST /internal/refresh-funda. Funda query filters to active listings only (`disappeared_at IS NULL` and status `"Beschikbaar"` or `""`)
- `packages/backend/src/services/listing-sync.ts` — Upserts incoming listings, marks disappeared ones, enqueues translate-description + telegram-notify jobs for active listings
- `packages/backend/src/services/job-queue.ts` — Database-backed job queue: enqueue, claim, complete/fail/skip jobs
- `packages/backend/src/services/queue-processor.ts` — Background processor: polls for pending jobs, dispatches to handlers, rate-limits
- `packages/backend/src/services/ai-catch-analysis.ts` — Claude API call for the per-listing "what's the catch?" review (tuned for renters)
- `packages/backend/src/services/buurt-matcher.ts` — Matches listing coordinates to neighbourhood polygons for buurt stats (safety + crime rate)

### Services & Scripts

- `services/funda-cron/funda_core.py` — Shared Funda logic: fetch, filter, enrich with coordinates, convert to GeoJSON. Rentals only (`offering_type="rent"`, filtered to `price_condition == "per_month"` because pyfunda leaks buy results). 15 km radius around Amsterdam Centraal, ≥2 bedrooms, energy label A+++ through C (strictly better than D).
- `services/funda-cron/fetch_and_push.py` — Cron job: calls `funda_core.fetch_and_build_geojson()` and POSTs result to backend
- `scripts/fetch-data.ts` — Data precomputation pipeline (Overpass transit + Amsterdam BBGA buurten)
- `scripts/fetch_funda.py` — Thin wrapper: imports from `funda_core`, outputs GeoJSON to stdout
- `scripts/fetch-ferries.ts` — Fetches GVB ferry routes + stops from Overpass and merges them into `lines.geojson` and `stations.json`

## Conventions

- TypeScript throughout with `strict: true` (both frontend and backend have tsconfigs)
- **No type assertions** (`as`, `!`) — use runtime narrowing (type guards, `typeof` checks) instead. Use `getGeoJSONSource()` from `geo/map-utils.ts` instead of `as GeoJSONSource`.
- **Path aliases**: Frontend uses `@/` alias for `src/` (configured in `tsconfig.json` and `vite.config.ts`). All imports should use `@/` instead of relative paths.
- **Styling**: Tailwind CSS v4 utilities. Design tokens in `src/app.css` `@theme` block. Custom `glass` utility for glassmorphism panels. Vue transition classes kept in scoped `<style>` blocks. MapLibre popup styles in `src/styles/funda-popup.css` (global).
- **Formatting**: oxfmt (runs on pre-commit via lefthook)
- **Linting**: oxlint with `correctness`, `suspicious`, and `perf` categories enabled. Config in `.oxlintrc.json`.
- **Pre-commit hooks**: lefthook runs format check, lint, and type-check for both packages in parallel
- No test framework set up yet
- **Frontend composable pattern**: MapView.vue is a thin orchestrator. Each concern (zones, transit, routes, funda, buildings, popups) lives in its own `useXxx` composable under `src/composables/`. Composables receive the map instance and reactive state as parameters.
- Shared types in `packages/frontend/src/types/transit.ts` (StopType enum, TransitStop interface) and `packages/frontend/src/types/buurt.ts` (BuurtProperties interface)
- Office locations defined in `packages/frontend/src/geo/constants.ts`
- Transit line colors: train=#003DA5 (OV blue), metro=#E4003A (red), tram=#7B2D8E (purple), ferry=#0891B2 (cyan, dashed), funda=#E8950F (amber). Defined in `COLORS` object in `geo/constants.ts` and as Tailwind tokens in `app.css`.
- Listing price shown as monthly rent in popup, modal, activity feed, and viewings page.
- Vite config uses `target: "esnext"` for both optimizeDeps and build (required for MapLibre GL)

## Deployment

- **Hosting**: Railway (two services). Config in `railway.toml` (web service only).
- **URL**: https://ernest.vhtm.eu
- **Web service** (`ernest-web`): Railpack detects `bun.lock`, installs Bun, runs `bun install && bun run build`, then `bun run start`. Health check hits `/api/health`. Has a 1 GB volume mounted at `/data` for persisted Funda data.
- **Cron service** (`ernest-cron`): Dockerfile-based Python service. Root directory `services/funda-cron`. Runs on schedule `0 5-21 * * *` (hourly during daytime-ish UTC hours). Communicates with web service via Railway internal networking (`http://ernest.railway.internal:8080`).
- **Env vars on web service**: `DATABASE_URL` (references `ernest-db`), `JWT_SECRET`, `ORIGIN=https://ernest.vhtm.eu`, `RP_ID=ernest.vhtm.eu`, `NODE_ENV=production`, `REFRESH_SECRET`, `VOLUME_PATH=/data`, `ANTHROPIC_API_KEY` (for AI enrichment), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (for new-listing notifications). `PORT` is auto-set by Railway. All four auth vars (`DATABASE_URL`, `JWT_SECRET`, `ORIGIN`, `RP_ID`) are required — server refuses to start without them. `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` are optional — enrichment/notification jobs are skipped if not set.
- **Env vars on cron service**: `REFRESH_SECRET` (same value), `REFRESH_URL=http://ernest.railway.internal:8080/api/internal/refresh-funda`.
- **Database** (`ernest-db`): Railway-managed PostgreSQL. Connected to web service via internal networking. Drizzle migrations run on startup. To query the production DB locally, use `DATABASE_PUBLIC_URL` (not `DATABASE_URL`, which uses the internal hostname `postgres.railway.internal` and is unreachable from outside Railway): `railway run --service ernest-db -- sh -c 'psql "$DATABASE_PUBLIC_URL" -c "SELECT ..."'`. Note: use `sh -c '...'` with single quotes so the env var is expanded by the remote shell, not locally.
- **Auto-deploy**: GitHub repo connected for deploy-on-push to `main`.

## External APIs (used by fetch-data script only)

- **Overpass** (`overpass.kumi.systems`): Transit stops and lines from OSM. Rate-limited — make requests sequential with delays.
- **Amsterdam BBGA** (`api.data.amsterdam.nl`): Neighbourhood boundaries (`/v1/gebieden/buurten`) and statistics (`/v1/bbga/kerncijfers`). Free, no auth. Produces `buurten.geojson` — neighbourhood polygons with WOZ value, owner-occupied %, safety rating, and crime rate properties (only safety + crime rate are surfaced to listings now that we're renting).
- **Funda** (via [pyfunda](https://github.com/0xMH/pyfunda)): Rental listings from Funda's mobile API. Requires `pip install pyfunda` (Python 3.13). `offering_type="rent"` leaks some buy results, so we filter to `price_condition == "per_month"`. Search results don't include coordinates — the script fetches individual listing details in parallel (8 workers) to get lat/lng and photo URLs.
