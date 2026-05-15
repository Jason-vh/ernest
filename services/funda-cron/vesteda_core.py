"""Pull Vesteda's currently-available rentals via their internal search API.

The site itself is a Vue SPA, but it talks to a JSON endpoint at
`/api/units/search/facet` that requires no auth, no cookies, no CSRF token —
just a POST with a place + radius + price range. The response includes
coordinates, photos, price, surface, bedrooms, etc., so we don't have to
geocode or parse HTML.

Status codes observed in the response:
  1 = currently available
  2 = reserved / under offer
  3 = rented
  4 = becoming available again
We keep status==1.
"""

import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import requests

SEARCH_URL = "https://www.vesteda.com/api/units/search/facet"
USER_AGENT = "ernest-vesteda-cron/1.0 (+https://ernest.vhtm.eu)"
HTTP_TIMEOUT = 30
DETAIL_HOST = "https://www.vesteda.com"
PHOTO_WORKERS = 8

# CDN photo URL pattern — the /o/ path segment marks original-quality images
_AZURE_PHOTO_RE = re.compile(
    r"https://[^\s\"'<>]*azureedge\.net/[^\s\"'<>?&#]+\.(?:jpg|jpeg|png|webp)",
    re.IGNORECASE,
)
# Description is embedded as JSON string in the server-rendered HTML
_DESC_RE = re.compile(r'"description":"((?:[^\\"]|\\.)*?)"')
# Energy label sits in a <dt>Energielabel</dt><dd>X</dd> pair (minified, no closing tags).
_ENERGY_RE = re.compile(r"Energielabel</a>\s*<dd[^>]*>\s*([A-G][+]{0,3})", re.IGNORECASE)

# Amsterdam Centraal-ish; matches the latlon Vesteda uses in their dropdown.
AMSTERDAM = {
    "placeType": "1",
    "name": "Amsterdam, Nederland",
    "latitude": "52.367573",
    "longitude": "4.904139",
}
RADIUS_KM = 7

MIN_BEDROOMS = 2
MIN_LIVING_AREA_M2 = 70
MAX_RENT_EUR = 3000
MIN_RENT_EUR = 500

AVAILABLE_STATUS = 1


def _search_payload():
    return {
        "filters": [0],
        "latitude": float(AMSTERDAM["latitude"]),
        "longitude": float(AMSTERDAM["longitude"]),
        "place": AMSTERDAM["name"],
        "placeObject": AMSTERDAM,
        "placeType": int(AMSTERDAM["placeType"]),
        "radius": RADIUS_KM,
        "sorting": 0,
        "priceFrom": MIN_RENT_EUR,
        "priceTo": MAX_RENT_EUR,
        "language": "nl",
    }


def fetch_units(log=print) -> list:
    """POST the search endpoint, return the flat list of `objects`."""
    log(f"Fetching Vesteda units (Amsterdam, {RADIUS_KM} km, €{MIN_RENT_EUR}–{MAX_RENT_EUR})...")
    resp = requests.post(
        SEARCH_URL,
        json=_search_payload(),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Referer": "https://www.vesteda.com/nl/woning-zoeken",
            "Origin": "https://www.vesteda.com",
        },
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results") or {}
    objects = results.get("objects") or []
    log(f"  Total in response: {data.get('count')} (objects: {len(objects)})")
    return objects


def filter_units(units, log=print):
    kept = []
    for u in units:
        if u.get("status") != AVAILABLE_STATUS:
            continue
        price = u.get("priceUnformatted")
        if not isinstance(price, (int, float)) or price <= 0 or price > MAX_RENT_EUR:
            continue
        bedrooms = u.get("numberOfBedRooms")
        if not isinstance(bedrooms, int) or bedrooms < MIN_BEDROOMS:
            continue
        size = u.get("size")
        if not isinstance(size, (int, float)) or size < MIN_LIVING_AREA_M2:
            continue
        if not u.get("latitude") or not u.get("longitude"):
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


def _format_address(unit: dict) -> str:
    parts = [unit.get("street") or "", str(unit.get("houseNumber") or "")]
    addition = unit.get("houseNumberAddition")
    if isinstance(addition, str) and addition.strip():
        parts.append(addition.strip())
    return " ".join(p for p in parts if p).strip()


def _cover_photo(unit: dict) -> str:
    big = unit.get("imageBig") or unit.get("imageSmall")
    return _full_url(big) if isinstance(big, str) and big else ""


def _fetch_detail(unit: dict, log=print) -> tuple:
    """Scrape the listing detail page for photos, description, energy label."""
    unit_id = unit.get("id") or unit.get("code")
    url_path = unit.get("url") or ""
    if not url_path:
        return unit_id, [], "", None
    url = _full_url(url_path)
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html",
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        log(f"  Warning: failed to fetch detail for {unit_id}: {e}")
        return unit_id, [], "", None

    # Extract photos from CDN URLs; skip generic 'content.jpg' placeholder images
    urls = list(dict.fromkeys(_AZURE_PHOTO_RE.findall(html)))
    photos = [u for u in urls if not u.rsplit("/", 1)[-1].startswith("content.")]
    if not photos:
        cover = _cover_photo(unit)
        if cover:
            photos = [cover]

    # Extract description from embedded JSON
    description = ""
    m = _DESC_RE.search(html)
    if m:
        try:
            description = json.loads('"' + m.group(1) + '"')
        except (json.JSONDecodeError, ValueError):
            description = m.group(1)

    # Energy label from <dt>Energielabel</dt><dd>X</dd> pair
    energy_label = None
    em = _ENERGY_RE.search(html)
    if em:
        energy_label = em.group(1).upper()

    return unit_id, photos, description, energy_label


def fetch_all_details(units, log=print) -> dict:
    """Return {unit_id: {"photos": [...], "description": str, "energy_label": str | None}}."""
    log(f"  Fetching details for {len(units)} Vesteda listings ({PHOTO_WORKERS} workers)...")
    results = {}
    with ThreadPoolExecutor(max_workers=PHOTO_WORKERS) as executor:
        futures = {
            executor.submit(_fetch_detail, u, log): (u.get("id") or u.get("code"))
            for u in units
        }
        for future in as_completed(futures):
            unit_id, photos, description, energy_label = future.result()
            results[unit_id] = {
                "photos": photos,
                "description": description,
                "energy_label": energy_label,
            }
    found_photos = sum(1 for d in results.values() if d["photos"])
    found_desc = sum(1 for d in results.values() if d["description"])
    found_energy = sum(1 for d in results.values() if d["energy_label"])
    log(
        f"  Got photos for {found_photos}/{len(units)}, descriptions for {found_desc}/{len(units)}, "
        f"energy labels for {found_energy}/{len(units)}"
    )
    return results


def to_geojson(units, details=None):
    features = []
    for u in units:
        address = _format_address(u)
        if not address:
            continue
        unit_id = u.get("id") or u.get("code")
        if not unit_id:
            continue
        det = (details or {}).get(unit_id) or {}
        photos = det.get("photos") or []
        if not photos:
            cover = _cover_photo(u)
            if cover:
                photos = [cover]
        description = det.get("description") or ""
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(u["longitude"]), float(u["latitude"])],
                },
                "properties": {
                    "fundaId": f"vesteda-{unit_id}",
                    "source": "vesteda",
                    "price": int(u["priceUnformatted"]),
                    "address": address,
                    "bedrooms": u.get("numberOfBedRooms"),
                    "livingArea": int(u["size"]),
                    "energyLabel": det.get("energy_label"),
                    "objectType": None,
                    "houseType": None,
                    "constructionYear": None,
                    "postcode": u.get("postalCode") or None,
                    "city": u.get("city") or None,
                    "neighbourhood": u.get("district") or None,
                    "description": description,
                    "offeredSince": u.get("upcomingeventdate") or None,
                    "hasGarden": None,
                    "hasBalcony": None,
                    "hasRoofTerrace": None,
                    "status": "Beschikbaar",
                    "photos": json.dumps(photos),
                    "url": _full_url(u.get("url") or ""),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(log=print, limit=None):
    units = fetch_units(log)
    units = filter_units(units, log)
    if limit:
        units = units[:limit]
    details = fetch_all_details(units, log)
    geojson = to_geojson(units, details)
    log(f"  Vesteda: {len(geojson['features'])} features ready")
    return geojson


def normalize_address(address: Optional[str]) -> str:
    """Case- and accent-insensitive address key for cross-source dedup."""
    if not isinstance(address, str):
        return ""
    s = unicodedata.normalize("NFKD", address)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    # Collapse spaces around a single-letter suffix: "10 c" -> "10c"
    s = re.sub(r"(\d+)\s+([a-z])\b", r"\1\2", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
