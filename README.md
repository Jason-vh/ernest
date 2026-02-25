# Ernest

Amsterdam house-hunting map. Shows cycling distance zones from two offices overlaid with transit stations, neighbourhood data, and Funda property listings on a clean greyscale base map.

## What it does

- Computes 10/20/30-minute cycling isochrones from two offices (FareHarbor and Airwallex), intersects them to show areas reachable from **both** within each time budget. Isochrones are augmented with ferry supplements for Amsterdam Noord (Buiksloterweg F3).
- Overlays transit stations (train, metro, tram) and line geometries
- Shows Amsterdam neighbourhood (buurt) boundaries with labels
- Displays available Funda listings (€450k–€600k, ≥2 bed, ≥65 m²) from Amsterdam, Diemen, Duivendrecht, Amstelveen, and Ouderkerk aan de Amstel as map markers with photo popups and estimated overbid pricing — refreshed hourly
- AI-enriches listings with positives, negatives, and translated descriptions using Claude Haiku
- Greyscale base map with parks and water preserved in color

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3 + Vite + Tailwind CSS v4 (TypeScript) |
| Backend | Bun + Hono |
| Map | MapLibre GL JS |
| Tiles | OpenFreeMap (`liberty` style) |
| Isochrone | Valhalla (FOSSGIS) |
| Transit data | Overpass API (OSM) |
| Neighbourhood data | Amsterdam BBGA API |
| Property listings | Funda via [pyfunda](https://github.com/0xMH/pyfunda) (Python) |
| Database | PostgreSQL via Drizzle ORM |
| AI enrichment | Claude Haiku (Anthropic API) |
| Spatial ops | Turf.js |

## Getting started

Requires [Bun](https://bun.sh) and Python 3.13 with pyfunda:

```sh
bun install
pip install pyfunda    # Python dependency for Funda listings
```

### Fetch data (only needed once, or to refresh)

```sh
bun run fetch-data
```

This hits Valhalla, Overpass, Amsterdam BBGA, and Funda APIs, computes zone intersections, filters stations and listings, and writes output to `packages/backend/data/`. The Funda fetch takes a few minutes as it retrieves individual listing details for coordinates and photos.

### Development

Run backend and frontend in separate terminals:

```sh
bun run dev:backend    # Hono server on :3000
bun run dev:frontend   # Vite dev server on :5173 (proxies /api to :3000)
```

### Code quality

```sh
bun run check          # Format check (oxfmt) + lint (oxlint)
bun run fmt            # Auto-format all source files
bun run lint           # Lint only
bun run typecheck      # Type-check both frontend and backend
```

### Production

```sh
bun run build          # Builds Vue frontend to packages/frontend/dist/
bun run start          # Hono serves API + static files on :3000
```

The backend serves the built frontend via `serveStatic` with SPA fallback. Set `PORT` env var to override the default port (3000).

### Deployment

Hosted on [Railway](https://railway.com) at **https://ernest.vanhattum.xyz**. Two services:

**Web service** (`ernest-web`): Config in `railway.toml`. Railway auto-detects Bun, builds the frontend, and runs the server. A 1 GB volume at `/data` persists Funda data across deploys.

**Cron service** (`ernest-cron`): Dockerfile-based Python service in `services/funda-cron/`. Runs hourly during daytime-ish UTC hours (`0 5-21 * * *`), fetches fresh Funda listings using shared logic in `funda_core.py`, and POSTs them to the web service via Railway's internal network. The web service updates in-memory data and persists to the volume. The local script (`scripts/fetch_funda.py`) imports the same `funda_core` module to ensure identical fetch behavior.

Environment variables:
- **Web service**: `DATABASE_URL`, `JWT_SECRET`, `ORIGIN`, `RP_ID`, `NODE_ENV=production`, `REFRESH_SECRET`, `VOLUME_PATH=/data`, `ANTHROPIC_API_KEY` (optional — AI enrichment skipped if not set), `PORT` (auto-set)
- **Cron service**: `REFRESH_SECRET` (same value), `REFRESH_URL=http://ernest.railway.internal:8080/api/internal/refresh-funda`
- **Database** (`ernest-db`): Railway-managed PostgreSQL, connected via internal networking

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/isochrone` | Zone intersection GeoJSON (10/20/30 min) |
| `GET /api/stations` | Transit stops JSON |
| `GET /api/lines` | Transit line geometries GeoJSON |
| `GET /api/buurten` | Neighbourhood boundaries + stats GeoJSON |
| `GET /api/funda` | Available Funda listings (with AI enrichment, reactions, notes) |
| `POST /api/internal/refresh-funda` | Refresh Funda data (Bearer auth, used by cron service) |

## Data pipeline

The `scripts/fetch-data.ts` script:

1. Fetches 10/20/30-min cycling isochrones from Valhalla for both offices
2. Augments isochrones with ferry supplements for Amsterdam Noord — computes cycling time to the Buiksloterweg ferry south landing via Valhalla `/route`, fetches supplementary isochrones from the north landing with the remaining time budget, and unions them with `@turf/union`
3. Computes zone intersections using `@turf/intersect`
4. Fetches transit stops from Overpass (tram, metro, train)
5. Deduplicates stops (prefers way/relation over node)
6. Filters to stops within the 30-min zone using `@turf/boolean-point-in-polygon`
7. Fetches Amsterdam neighbourhood (buurt) boundaries from `api.data.amsterdam.nl`
8. Fetches BBGA statistics (WOZ value, owner-occupied %, safety rating, crime rate)
9. Filters neighbourhoods to those overlapping the 30-min zone using `@turf/intersect`
10. Writes `isochrone.geojson`, `stations.json`, and `buurten.geojson` to `packages/backend/data/`

Transit lines (`lines.geojson`) are fetched separately and cached — the script skips this if the file already exists.

## Background jobs

When new listings arrive via the hourly cron refresh, the backend enqueues background jobs for active listings (status "Beschikbaar"):

- **`ai-enrich`**: Sends listing photos + property data to Claude Haiku, gets back positives (standout features), negatives (concerns), and an English description with marketing fluff stripped. Rate-limited at 500ms between calls.
- **`compute-routes`**: Computes cycling routes from the listing to both offices via Valhalla. Rate-limited at 200ms between calls.

Jobs are stored in a `jobs` table with deduplication (one job per type per listing). Failed jobs retry with exponential backoff (30s → 120s → 480s). The queue processor starts automatically on server boot and also re-enqueues any un-enriched active listings.
