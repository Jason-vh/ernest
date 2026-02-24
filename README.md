# Ernest

Amsterdam house-hunting map. Shows cycling distance zones from two offices overlaid with transit stations, neighbourhood data, and Funda property listings on a clean greyscale base map.

## What it does

- Computes 10/20/30-minute cycling isochrones from two offices (FareHarbor and Airwallex), intersects them to show areas reachable from **both** within each time budget
- Overlays transit stations (train, metro, tram) and line geometries
- Shows Amsterdam neighbourhood (buurt) boundaries with labels
- Displays available Funda listings (€450k–€600k, ≥2 bed, ≥65 m², energy label ≥ D) as map markers with photo popups and estimated overbid pricing — refreshed hourly
- Greyscale base map with parks and water preserved in color

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3 + Vite (TypeScript) |
| Backend | Bun + Hono |
| Map | MapLibre GL JS |
| Tiles | OpenFreeMap (`liberty` style) |
| Isochrone | Valhalla (FOSSGIS) |
| Transit data | Overpass API (OSM) |
| Neighbourhood data | Amsterdam BBGA API |
| Property listings | Funda via [pyfunda](https://github.com/0xMH/pyfunda) (Python) |
| Spatial ops | Turf.js |

## Project structure

```
ernest/
  package.json              # Bun workspaces, root scripts
  packages/
    frontend/               # Vue 3 + Vite SPA
      src/
        components/
          MapView.vue       # Main map with all layers
          Legend.vue         # Color legend overlay
          App.vue
        api/client.ts       # Typed fetch wrappers
        geo/
          constants.ts      # Office coords, map center, zoom
          greyscale-style.ts # Transforms liberty style to greyscale
        types/transit.ts    # StopType enum, TransitStop interface
        types/buurt.ts      # BuurtProperties interface
    backend/                # Bun + Hono API server
      src/
        index.ts            # Hono app, static serving, SPA fallback
        routes/
          geodata.ts        # GET /api/* + POST /api/internal/refresh-funda
          health.ts         # GET /api/health
      data/                 # Precomputed static data (bundled fallback)
        isochrone.geojson   # Zone intersection polygons (10/20/30 min)
        stations.json       # Filtered transit stops
        lines.geojson       # Transit line geometries
        buurten.geojson     # Neighbourhood boundaries + stats
        funda.geojson       # Available Funda listings with coordinates + photos
  scripts/
    fetch-data.ts           # Fetches and precomputes all static data
    fetch_funda.py          # Fetches Funda listings via pyfunda (Python 3.13)
  services/
    funda-cron/             # Railway cron service (hourly Funda refresh)
      fetch_and_push.py     # Fetches listings, POSTs to backend
      Dockerfile
      requirements.txt
```

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

### Production

```sh
bun run build          # Builds Vue frontend to packages/frontend/dist/
bun run start          # Hono serves API + static files on :3000
```

The backend serves the built frontend via `serveStatic` with SPA fallback. Set `PORT` env var to override the default port (3000).

### Deployment

Hosted on [Railway](https://railway.com) at **https://ernest.vanhattum.xyz**. Two services:

**Web service** (`ernest-web`): Config in `railway.toml`. Railway auto-detects Bun, builds the frontend, and runs the server. A 1 GB volume at `/data` persists Funda data across deploys.

**Cron service** (`ernest-cron`): Dockerfile-based Python service in `services/funda-cron/`. Runs hourly (`0 * * * *`), fetches fresh Funda listings, and POSTs them to the web service via Railway's internal network. The web service filters listings to the 30-min cycling zone, updates in-memory data, and persists to the volume.

Environment variables:
- **Web service**: `NODE_ENV=production`, `REFRESH_SECRET`, `VOLUME_PATH=/data`, `PORT` (auto-set)
- **Cron service**: `REFRESH_SECRET` (same value), `REFRESH_URL=http://ernest.railway.internal:8080/api/internal/refresh-funda`

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/isochrone` | Zone intersection GeoJSON (10/20/30 min) |
| `GET /api/stations` | Transit stops JSON |
| `GET /api/lines` | Transit line geometries GeoJSON |
| `GET /api/buurten` | Neighbourhood boundaries + stats GeoJSON |
| `GET /api/funda` | Available Funda listings GeoJSON |
| `POST /api/internal/refresh-funda` | Refresh Funda data (Bearer auth, used by cron service) |

## Data pipeline

The `scripts/fetch-data.ts` script:

1. Fetches 10/20/30-min cycling isochrones from Valhalla for both offices
2. Computes zone intersections using `@turf/intersect`
3. Fetches transit stops from Overpass (tram, metro, train)
4. Deduplicates stops (prefers way/relation over node)
5. Filters to stops within the 30-min zone using `@turf/boolean-point-in-polygon`
6. Fetches Amsterdam neighbourhood (buurt) boundaries from `api.data.amsterdam.nl`
7. Fetches BBGA statistics (WOZ value, owner-occupied %, safety rating, crime rate)
8. Filters neighbourhoods to those overlapping the 30-min zone using `@turf/intersect`
9. Spawns `fetch_funda.py` which fetches Funda listings (€450k–€600k, ≥2 bed, ≥65 m², energy label ≥ D), retrieves coordinates/photos via parallel detail fetches, and filters to status "Beschikbaar" only
10. Filters Funda listings to the 30-min cycling zone
11. Writes `isochrone.geojson`, `stations.json`, `buurten.geojson`, and `funda.geojson` to `packages/backend/data/`

Transit lines (`lines.geojson`) are fetched separately and cached — the script skips this if the file already exists.
