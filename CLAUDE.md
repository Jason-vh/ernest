# CLAUDE.md

## Project overview

Ernest is an Amsterdam house-hunting map. Bun monorepo with Vue 3 frontend and Hono backend. Static geodata is precomputed and served from disk.

## Commands

```sh
bun install              # Install all workspace deps
bun run dev:backend      # Start Hono server on :3000
bun run dev:frontend     # Start Vite dev server on :5173 (proxies /api -> :3000)
bun run build            # Build Vue frontend to packages/frontend/dist/
bun run start            # Production: Hono serves API + frontend on :3000
bun run fetch-data       # Refetch isochrones + stations + buurten + funda from APIs
bun run fetch-funda      # Run Funda fetch standalone (python3.13)
```

## Architecture

- **Monorepo**: Bun workspaces (`packages/*`, `scripts`)
- **Frontend** (`packages/frontend`): Vue 3 + Vite + TypeScript. Single-page app with MapLibre GL JS map.
- **Backend** (`packages/backend`): Bun + Hono. Serves precomputed data as JSON endpoints and the built frontend via `serveStatic`. All file paths resolved via `import.meta.dir` (never relative to CWD).
- **Scripts** (`scripts/`): `fetch-data.ts` runs with Bun to precompute geodata (uses Turf.js for spatial operations). `fetch_funda.py` fetches Funda listings via pyfunda (Python 3.13, called by `fetch-data.ts` via `Bun.spawn`).
- **Data** (`packages/backend/data/`): Static JSON/GeoJSON files loaded once at server startup.

## Key files

- `packages/frontend/src/components/MapView.vue` — All map layers, sources, and interactions
- `packages/frontend/src/geo/greyscale-style.ts` — Transforms OpenFreeMap bright style to greyscale (preserves parks/water). Controls which base map layers are hidden via `HIDDEN_LAYERS`.
- `packages/frontend/src/geo/constants.ts` — Office coordinates, map center, default zoom
- `packages/backend/src/routes/geodata.ts` — API endpoints for isochrone, stations, lines, buurten, funda
- `scripts/fetch-data.ts` — Data precomputation pipeline (Valhalla + Overpass + Amsterdam BBGA + Funda + Turf)
- `scripts/fetch_funda.py` — Python script fetching Funda listings via pyfunda. Filters: €450k–€600k, ≥2 bed, ≥65 m², energy label ≥ D, status "Beschikbaar" only

## Conventions

- TypeScript throughout
- No test framework set up yet
- Shared types in `packages/frontend/src/types/transit.ts` (StopType enum, TransitStop interface) and `packages/frontend/src/types/buurt.ts` (BuurtProperties interface)
- Office locations defined in both `scripts/fetch-data.ts` and `packages/frontend/src/geo/constants.ts` — keep in sync if changed
- Transit line colors: train=#003DA5 (OV blue), metro=#E4003A (red), tram=#7B2D8E (purple), funda=#E8950F (amber)
- Funda overbid price shown at 115% of list price in popup
- Vite config uses `target: "esnext"` for both optimizeDeps and build (required for MapLibre GL)

## Deployment

- **Hosting**: Railway (single service). Config in `railway.toml`.
- **URL**: https://ernest.vanhattum.xyz
- **How it works**: Railway's Railpack detects `bun.lock`, installs Bun, runs `bun install && bun run build`, then `bun run start`. Health check hits `/api/health`.
- **Env vars** (set in Railway dashboard): `NODE_ENV=production`. `PORT` is auto-set by Railway.
- **Auto-deploy**: Connect GitHub repo in Railway dashboard for deploy-on-push to `main`.

## External APIs (used by fetch-data script only)

- **Valhalla** (`valhalla1.openstreetmap.de`): Cycling isochrones. Rate-limited — add delays between requests.
- **Overpass** (`overpass.kumi.systems`): Transit stops and lines from OSM. Rate-limited — make requests sequential with delays.
- **Amsterdam BBGA** (`api.data.amsterdam.nl`): Neighbourhood boundaries (`/v1/gebieden/buurten`) and statistics (`/v1/bbga/kerncijfers`). Free, no auth. Produces `buurten.geojson` — neighbourhood polygons with WOZ value, owner-occupied %, safety rating, and crime rate properties.
- **Funda** (via [pyfunda](https://github.com/0xMH/pyfunda)): Property listings from Funda's mobile API. Requires `pip install pyfunda` (Python 3.13). Search results don't include coordinates — the script fetches individual listing details in parallel (8 workers) to get lat/lng and photo URLs. The `characteristics['Status']` field from detail pages is the reliable source for listing status (the top-level `status` field always says "available").
