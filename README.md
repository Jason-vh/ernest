# Ernest

Amsterdam house-hunting map. Shows cycling distance zones from two offices overlaid with transit stations, neighbourhood data, and Funda property listings on a clean greyscale base map.

## What it does

- Computes 10/20/30-minute cycling isochrones from two offices (FareHarbor and Airwallex), intersects them to show areas reachable from **both** within each time budget. Isochrones are augmented with ferry supplements for Amsterdam Noord (Buiksloterweg F3).
- Overlays transit stations (train, metro, tram) and line geometries
- Shows Amsterdam neighbourhood (buurt) boundaries with labels
- Displays available Funda listings (€450k–€600k, ≥2 bed, ≥65 m²) from Amsterdam, Diemen, Duivendrecht, Amstelveen, and Ouderkerk aan de Amstel as map markers with photo popups and estimated overbid pricing — refreshed hourly
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
| Spatial ops | Turf.js |

## Project structure

```
ernest/
  package.json              # Bun workspaces, root scripts
  packages/
    frontend/               # Vue 3 + Vite + Tailwind CSS v4 SPA
      src/
        app.css             # Tailwind entry, @theme tokens, glass utility
        components/
          MapView.vue       # Map orchestrator (wires composables)
          Legend.vue         # Zone/transit toggle legend
          FundaFilters.vue  # Funda search criteria panel
          AuthButton.vue    # Sign in / user dropdown
          AuthModal.vue     # Passkey login/register modal
          StationPopup.vue  # Transit station popup content
          App.vue
        composables/
          useMap.ts              # Map creation + style loading
          useOfficeMarkers.ts    # Office dot + label markers
          useIsochroneLayers.ts  # Zone fill/border layers + visibility
          useTransitLayers.ts    # Transit lines/circles/labels + visibility
          useRouteLayers.ts      # Cycling route layers + data watchers
          useFundaLayer.ts       # Funda source/layers + visibility
          useBuildingHighlightLayer.ts  # Building polygon matching
          useMapPopups.ts        # Popup creation + hover/click handlers
          useZoneState.ts        # Shared legend/filter state
          useCyclingRoutes.ts    # Cycling route fetching
          useAuth.ts             # Passkey auth composable
          useBuildingHighlights.ts  # Pure building-match function
        api/
          client.ts         # Typed fetch wrappers
          auth.ts           # WebAuthn API calls
        geo/
          constants.ts      # Office coords, map center, zoom, COLORS
          greyscale-style.ts # Transforms liberty style to greyscale
          map-utils.ts      # getGeoJSONSource() runtime-safe helper
        styles/
          funda-popup.css   # MapLibre popup overrides
        types/
          transit.ts        # StopType enum, TransitStop interface
          buurt.ts          # BuurtProperties interface
    backend/                # Bun + Hono API server
      src/
        index.ts            # Hono app, static serving, SPA fallback
        routes/
          geodata.ts        # GET /api/* + POST /api/internal/refresh-funda
          health.ts         # GET /api/health
          auth.ts           # WebAuthn registration/login, JWT sessions
        db/schema.ts        # Drizzle table definitions
        config.ts           # Required env var validation
      data/                 # Precomputed static data (bundled fallback)
        isochrone.geojson   # Zone intersection polygons (10/20/30 min)
        stations.json       # Filtered transit stops
        lines.geojson       # Transit line geometries
        buurten.geojson     # Neighbourhood boundaries + stats
        funda.geojson       # Available Funda listings with coordinates + photos
  scripts/
    fetch-data.ts           # Fetches and precomputes all static data
    fetch_funda.py          # Thin wrapper: imports funda_core, outputs GeoJSON to stdout
  services/
    funda-cron/             # Railway cron service (hourly Funda refresh)
      funda_core.py         # Shared Funda fetch/filter/enrich/GeoJSON logic
      fetch_and_push.py     # Calls funda_core, POSTs result to backend
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

**Cron service** (`ernest-cron`): Dockerfile-based Python service in `services/funda-cron/`. Runs hourly (`0 * * * *`), fetches fresh Funda listings using shared logic in `funda_core.py`, and POSTs them to the web service via Railway's internal network. The web service updates in-memory data and persists to the volume. The local script (`scripts/fetch_funda.py`) imports the same `funda_core` module to ensure identical fetch behavior.

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
2. Augments isochrones with ferry supplements for Amsterdam Noord — computes cycling time to the Buiksloterweg ferry south landing via Valhalla `/route`, fetches supplementary isochrones from the north landing with the remaining time budget, and unions them with `@turf/union`
3. Computes zone intersections using `@turf/intersect`
4. Fetches transit stops from Overpass (tram, metro, train)
5. Deduplicates stops (prefers way/relation over node)
6. Filters to stops within the 30-min zone using `@turf/boolean-point-in-polygon`
7. Fetches Amsterdam neighbourhood (buurt) boundaries from `api.data.amsterdam.nl`
8. Fetches BBGA statistics (WOZ value, owner-occupied %, safety rating, crime rate)
9. Filters neighbourhoods to those overlapping the 30-min zone using `@turf/intersect`
10. Spawns `fetch_funda.py` which searches Funda listings across Amsterdam, Diemen, Duivendrecht, Amstelveen, and Ouderkerk aan de Amstel (€450k–€600k, ≥2 bed, ≥65 m²), retrieves coordinates/photos via parallel detail fetches, and filters to status "Beschikbaar" only
11. Writes `isochrone.geojson`, `stations.json`, `buurten.geojson`, and `funda.geojson` to `packages/backend/data/`

Transit lines (`lines.geojson`) are fetched separately and cached — the script skips this if the file already exists.
