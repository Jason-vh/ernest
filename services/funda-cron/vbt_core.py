"""Pull VB&T Verhuurmakelaars rental listings via their internal search API.

The site is a Vue SPA backed by a JSON endpoint at `/api/properties/{pageSize}/{page}`.
Filters are applied server-side via a `filter_properties` cookie. Coordinates,
price, and surface area are all included in the search response — no detail
fetches required.

`rooms` in VB&T is total kamers (Dutch rooms), not bedrooms. 3 kamers ≈ 2 bedrooms.
We request 3+ rooms to match the 2+ bedroom filter used across other sources.
"""

import json
import urllib.parse

import requests

SEARCH_BASE = "https://vbtverhuurmakelaars.nl/api/properties"
DETAIL_HOST = "https://vbtverhuurmakelaars.nl"
USER_AGENT = "ernest-vbt-cron/1.0 (+https://ernest.vhtm.eu)"
HTTP_TIMEOUT = 30

PAGE_SIZE = 50
AVAILABLE_STATUS = 1

MIN_LIVING_AREA_M2 = 70
MAX_RENT_EUR = 3000
# 3+ kamers ≈ 2+ bedrooms (living room counts as one kamer in Dutch convention)
MIN_ROOMS = 3

_FILTER = {
    "city": "Amsterdam",
    "radius": 0,
    "address": "",
    "priceRental": {"min": 0, "max": MAX_RENT_EUR},
    "availablefrom": "",
    "surface": MIN_LIVING_AREA_M2,
    "rooms": [3, 4, 5, 6, 7],
    "typeCategory": "",
}
_FILTER_COOKIE = urllib.parse.quote(json.dumps(_FILTER, separators=(",", ":")))


def _headers():
    return {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Referer": "https://vbtverhuurmakelaars.nl/woningen",
        "Cookie": f"language=nl; filter_properties={_FILTER_COOKIE}",
    }


def fetch_units(log=print) -> list:
    """Paginate through all search results and return a flat list of house dicts."""
    all_units = []
    page = 1
    page_count = None

    while page_count is None or page <= page_count:
        url = f"{SEARCH_BASE}/{PAGE_SIZE}/{page}?search=true"
        resp = requests.get(url, headers=_headers(), timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        if page_count is None:
            page_count = data.get("pageCount") or 1
            log(f"Fetching VB&T units (Amsterdam, ≥{MIN_LIVING_AREA_M2}m², ≤€{MAX_RENT_EUR}, {page_count} page(s))...")

        houses = data.get("houses") or []
        all_units.extend(houses)
        page += 1

    log(f"  Total fetched: {len(all_units)}")
    return all_units


def filter_units(units, log=print) -> list:
    kept = []
    for u in units:
        if (u.get("status") or {}).get("code") != AVAILABLE_STATUS:
            continue
        price = (u.get("prices") or {}).get("rental", {}).get("price")
        if not isinstance(price, (int, float)) or price <= 0 or price > MAX_RENT_EUR:
            continue
        plot = u.get("plot")
        if not isinstance(plot, (int, float)) or plot < MIN_LIVING_AREA_M2:
            continue
        rooms = u.get("rooms")
        if not isinstance(rooms, int) or rooms < MIN_ROOMS:
            continue
        if not u.get("coordinate"):
            continue
        kept.append(u)
    log(f"  {len(kept)} units after filtering")
    return kept


def _full_url(path: str) -> str:
    if not path:
        return ""
    if path.startswith("http"):
        return path
    return f"{DETAIL_HOST}{path}"


def to_geojson(units) -> dict:
    features = []
    for u in units:
        addr = u.get("address") or {}
        house = addr.get("house") or ""
        if not house:
            continue
        unit_id = u.get("id")
        if not unit_id:
            continue

        coord = u.get("coordinate")  # [lng, lat]
        lng, lat = float(coord[0]), float(coord[1])

        price = int((u.get("prices") or {}).get("rental", {}).get("price", 0))
        image = _full_url(u.get("image") or "")
        photos = [image] if image else []

        # Prefer the canonical external link the site itself exposes
        source_link = (u.get("source") or {}).get("externalLink") or ""
        url = source_link or _full_url(u.get("url") or "")

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "fundaId": f"vbt-{unit_id}",
                    "source": "vbt",
                    "price": price,
                    "address": house,
                    "bedrooms": None,
                    "livingArea": int(u["plot"]) if u.get("plot") else None,
                    "energyLabel": None,
                    "objectType": (u.get("attributes") or {}).get("type", {}).get("category") or None,
                    "houseType": None,
                    "constructionYear": None,
                    "postcode": None,
                    "city": addr.get("city") or None,
                    "neighbourhood": None,
                    "description": "",
                    "offeredSince": u.get("acceptance") or None,
                    "hasGarden": None,
                    "hasBalcony": None,
                    "hasRoofTerrace": None,
                    "status": "Beschikbaar",
                    "photos": json.dumps(photos),
                    "url": url,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(log=print, limit=None) -> dict:
    units = fetch_units(log)
    units = filter_units(units, log)
    if limit:
        units = units[:limit]
    geojson = to_geojson(units)
    log(f"  VB&T: {len(geojson['features'])} features ready")
    return geojson
