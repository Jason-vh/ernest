"""Shared Funda listing fetch, filter, and GeoJSON conversion logic."""

import json
import re
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from funda import Funda

PRICE_MIN = 450000
PRICE_MAX = 600000
MAX_ESTIMATED_CLOSING_PRICE = 590000
MIN_BEDROOMS = 3
MIN_LIVING_AREA = 65
ACCEPTABLE_LABELS = {"A+++", "A++", "A+", "A", "B", "C", "D", "unknown"}
DETAIL_WORKERS = 8
SEARCH_LOCATION = "amsterdam"
SEARCH_RADIUS_KM = 30
EXCLUDED_CONSTRUCTION_TYPES = {"newly_built"}
OVERBID_RATES_PATH = Path(__file__).resolve().parents[2] / "packages" / "shared" / "overbid-rates.json"
with OVERBID_RATES_PATH.open() as f:
    OVERBID_RATE_PCT_BY_CITY_SLUG = json.load(f)


def _parse_monthly_cost(value):
    """Parse Dutch currency strings like '€ 121,00 per maand' or '€ 1.800 per jaar' to monthly int."""
    if not value or not isinstance(value, str):
        return None
    # Strip euro sign and whitespace
    s = value.replace("€", "").strip()
    # Detect yearly vs monthly
    is_yearly = "jaar" in s.lower()
    # Extract numeric part: remove everything after the number
    # e.g. "121,00 per maand" or "1.800,- per jaar" or "1.800 per jaar"
    num_match = re.match(r"[\d.,\-]+", s.strip())
    if not num_match:
        return None
    num_str = num_match.group(0)
    # Remove trailing dash/comma (e.g. "1.800,-" -> "1.800")
    num_str = num_str.rstrip(",-")
    # Dutch format: dots are thousands, comma is decimal
    # Remove thousand separators
    num_str = num_str.replace(".", "")
    # Replace decimal comma with dot
    num_str = num_str.replace(",", ".")
    try:
        amount = float(num_str)
    except ValueError:
        return None
    if is_yearly:
        amount = amount / 12
    return round(amount)


def _is_terminal_page_error(error):
    """Return True when search paging moved past the last available page."""
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if status_code == 400:
        return True

    # Fallback for wrapped exceptions that only expose status in text.
    return "400" in str(error)


def _extract_city_slug_from_url(url):
    if not isinstance(url, str):
        return None

    match = re.search(r"/koop/([^/]+)/", url)
    if not match:
        return None

    slug = match.group(1).strip()
    return slug or None


def _build_listing_url(listing, detail):
    if detail:
        detail_url = detail.get("url")
        if isinstance(detail_url, str) and detail_url.strip():
            return detail_url.strip()

    listing_detail_url = listing.get("detail_url")
    if isinstance(listing_detail_url, str) and listing_detail_url.strip():
        return f"https://www.funda.nl{listing_detail_url}"

    return None


def _estimate_closing_price(price, url):
    if price is None:
        return None

    slug = _extract_city_slug_from_url(url)
    if slug is None:
        return None

    rate_pct = OVERBID_RATE_PCT_BY_CITY_SLUG.get(slug)
    if not isinstance(rate_pct, (int, float)):
        return None

    return round(price * (1 + rate_pct / 100))


def _is_excluded_construction_type(value):
    return isinstance(value, str) and value.strip().lower() in EXCLUDED_CONSTRUCTION_TYPES


def fetch_all_listings(log=print, limit=None):
    f = Funda(timeout=30)
    all_listings = []
    seen_ids = set()
    page = 0
    fetched_any_page = False
    tried_one_based_fallback = False
    retries_left = 2

    while True:
        log(f"  Fetching page {page}...")
        try:
            results = f.search_listing(
                SEARCH_LOCATION,
                radius_km=SEARCH_RADIUS_KM,
                offering_type="buy",
                price_min=PRICE_MIN,
                price_max=PRICE_MAX,
                construction_type="resale",
                page=page,
            )
        except Exception as e:
            # Some backends use one-based page indexing; recover once if page 0 is rejected.
            if page == 0 and _is_terminal_page_error(e) and not tried_one_based_fallback:
                tried_one_based_fallback = True
                page = 1
                log("  Page 0 returned 400, retrying with one-based paging at page 1...")
                continue

            if fetched_any_page and _is_terminal_page_error(e):
                if retries_left > 0:
                    retries_left -= 1
                    log(f"  Page {page} returned 400, retrying after delay ({retries_left} retries left)...")
                    time.sleep(3)
                    continue
                log(f"  Reached last page at page {page - 1} (page {page} returned 400 after retries)")
                break
            raise
        if not results:
            break
        fetched_any_page = True
        retries_left = 2
        for listing in results:
            gid = listing.get("global_id")
            if gid and gid not in seen_ids:
                seen_ids.add(gid)
                all_listings.append(listing)
                if limit and len(all_listings) >= limit:
                    log(f"  Reached limit of {limit} unique listings")
                    return all_listings
        page += 1
        time.sleep(1)

    log(f"  Fetched {len(all_listings)} total unique listings")
    return all_listings


def filter_listings(listings, log=print):
    filtered = []
    for listing in listings:
        price = listing.get("price")
        if price is None or price > MAX_ESTIMATED_CLOSING_PRICE:
            continue

        bedrooms = listing.get("bedrooms")
        if bedrooms is None or bedrooms < MIN_BEDROOMS:
            continue

        living_area = listing.get("living_area")
        if living_area is None or living_area < MIN_LIVING_AREA:
            continue

        energy_label = listing.get("energy_label") or ""
        if energy_label not in ACCEPTABLE_LABELS:
            continue

        if _is_excluded_construction_type(listing.get("construction_type")):
            continue

        filtered.append(listing)

    log(f"  {len(filtered)} listings after basic filtering")
    return filtered


def _fetch_detail(global_id, log=print):
    """Fetch individual listing to get coordinates."""
    try:
        f = Funda(timeout=30)
        detail = f.get_listing(global_id)
        if detail:
            lat = detail.get("latitude")
            lng = detail.get("longitude")
            if lat is not None and lng is not None:
                return global_id, float(lat), float(lng), detail
    except Exception as e:
        log(f"  Warning: failed to fetch {global_id}: {e}")
    return global_id, None, None, None


def enrich_with_coordinates(listings, log=print):
    """Fetch coordinates for all listings using parallel requests."""
    log(f"  Fetching details for {len(listings)} listings ({DETAIL_WORKERS} workers)...")
    coords = {}
    details = {}
    ids = [l.get("global_id") for l in listings if l.get("global_id")]

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(_fetch_detail, gid, log): gid for gid in ids}
        done = 0
        for future in as_completed(futures):
            gid, lat, lng, detail = future.result()
            if lat is not None:
                coords[gid] = (lat, lng)
                details[gid] = detail
            done += 1
            if done % 50 == 0:
                log(f"    {done}/{len(ids)} fetched...")

    log(f"  Got coordinates for {len(coords)}/{len(ids)} listings")
    return coords, details


def _fetch_woz_values(details, known_ids=None, log=print):
    """WOZ fetching disabled to avoid rate limits and slow execution on large radiuses."""
    return


def _extract_city(listing, detail):
    candidates = [
        (detail.get("city") if detail else None),
        listing.get("city"),
    ]

    for candidate in candidates:
        if isinstance(candidate, str):
            city = candidate.strip()
            if city:
                return city

    return None


def filter_affordable_listings(listings, details, log=print):
    filtered = []
    missing_rate_count = 0

    for listing in listings:
        detail = details.get(listing.get("global_id"))
        if detail and _is_excluded_construction_type(detail.get("construction_type")):
            continue

        price = listing.get("price")
        url = _build_listing_url(listing, detail)
        estimated_closing_price = _estimate_closing_price(price, url)

        if estimated_closing_price is None:
            missing_rate_count += 1
            address = listing.get("title") or listing.get("global_id") or "unknown listing"
            log(f"  Warning: missing overbid rate for {address}, skipping listing")
            continue

        if estimated_closing_price <= MAX_ESTIMATED_CLOSING_PRICE:
            filtered.append(listing)

    log(f"  {len(filtered)} listings after affordability filtering")
    if missing_rate_count > 0:
        log(f"  Skipped {missing_rate_count} listings with unknown overbid rates")
    return filtered


def to_geojson(listings, coords, details):
    features = []
    for listing in listings:
        gid = listing.get("global_id")
        if gid not in coords:
            continue

        lat, lng = coords[gid]
        detail = details.get(gid)

        url = ""
        photo_urls = []
        status = ""
        ownership = ""
        vve_costs = None
        erfpacht_costs = None
        woz_value = None
        if detail:
            try:
                url = detail.get("url") or ""
            except Exception:
                pass
            try:
                photo_urls = detail.get("photo_urls") or []
            except Exception:
                pass
            try:
                chars = detail.get("characteristics") or {}
                status = chars.get("Status", "")
                ownership = chars.get("Eigendomssituatie", chars.get("Eigendom", ""))
                vve_costs = _parse_monthly_cost(chars.get("Bijdrage VvE"))
                erfpacht_costs = _parse_monthly_cost(
                    chars.get("Erfpachtcanon") or chars.get("Canon")
                )
            except Exception:
                pass
            woz_value = detail.get("_woz_value")

        if not url:
            detail_url = listing.get("detail_url") or ""
            if detail_url:
                url = f"https://www.funda.nl{detail_url}"

        city = _extract_city(listing, detail)

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "fundaId": gid,
                    "price": listing.get("price"),
                    "address": listing.get("title") or "",
                    "bedrooms": listing.get("bedrooms"),
                    "livingArea": listing.get("living_area"),
                    "energyLabel": listing.get("energy_label") or None,
                    "objectType": listing.get("object_type") or None,
                    "houseType": (detail.get("house_type") or None) if detail else None,
                    "constructionYear": listing.get("construction_year"),
                    "postcode": listing.get("postcode") or None,
                    "city": city,
                    "neighbourhood": listing.get("neighbourhood") or None,
                    "description": (detail.get("description") or "") if detail else "",
                    "offeredSince": (detail.get("publication_date") if detail else None)
                        or listing.get("publish_date")
                        or None,
                    "hasGarden": listing.get("has_garden"),
                    "hasBalcony": listing.get("has_balcony"),
                    "hasRoofTerrace": listing.get("has_roof_terrace"),
                    "status": status,
                    "ownership": ownership,
                    "vveCostsMonthly": vve_costs,
                    "erfpachtCostsMonthly": erfpacht_costs,
                    "wozValue": woz_value,
                    "photos": json.dumps(photo_urls),
                    "url": url,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(known_ids=None, limit=None, log=print):
    """Full pipeline: fetch, filter, enrich, convert to GeoJSON."""
    log("Fetching Funda listings...")
    listings = fetch_all_listings(log, limit=limit)
    filtered = filter_listings(listings, log)
    coords, details = enrich_with_coordinates(filtered, log=log)
    affordable = filter_affordable_listings(filtered, details, log=log)
    _fetch_woz_values(details, known_ids=known_ids, log=log)
    geojson = to_geojson(affordable, coords, details)
    log(f"  {len(geojson['features'])} features with coordinates")
    return geojson
