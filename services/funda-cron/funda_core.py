"""Shared Funda rental fetch, filter, and GeoJSON conversion logic."""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from funda import Funda

MIN_BEDROOMS = 2
MIN_LIVING_AREA_M2 = 70
MAX_RENT_EUR = 3000
# "Energy label > D" means strictly better than D.
ACCEPTABLE_LABELS = {"A+++", "A++", "A+", "A", "B", "C"}
DETAIL_WORKERS = 8
SEARCH_LOCATION = "amsterdam"
SEARCH_RADIUS_KM = 7


def _is_terminal_page_error(error):
    """Return True when search paging moved past the last available page."""
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if status_code == 400:
        return True

    return "400" in str(error)


def _build_listing_url(listing, detail):
    if detail:
        detail_url = detail.get("url")
        if isinstance(detail_url, str) and detail_url.strip():
            return detail_url.strip()

    listing_detail_url = listing.get("detail_url")
    if isinstance(listing_detail_url, str) and listing_detail_url.strip():
        return f"https://www.funda.nl{listing_detail_url}"

    return None


def fetch_all_listings(log=print, limit=None):
    """Fetch all rental listings around Amsterdam.

    pyfunda's `offering_type="rent"` leaks buy listings, so callers must filter
    by `price_condition == "per_month"`.
    """
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
                offering_type="rent",
                price_max=MAX_RENT_EUR,
                area_min=MIN_LIVING_AREA_M2,
                page=page,
            )
        except Exception as e:
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
        # Funda's "rent" search leaks buy listings; only keep monthly rentals.
        if listing.get("price_condition") != "per_month":
            continue

        price = listing.get("price")
        if price is None or price > MAX_RENT_EUR:
            continue

        bedrooms = listing.get("bedrooms")
        if bedrooms is None or bedrooms < MIN_BEDROOMS:
            continue

        living_area = listing.get("living_area")
        if living_area is None or living_area < MIN_LIVING_AREA_M2:
            continue

        energy_label = listing.get("energy_label") or ""
        if energy_label not in ACCEPTABLE_LABELS:
            continue

        filtered.append(listing)

    log(f"  {len(filtered)} listings after filtering")
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
            except Exception:
                pass

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
                    "photos": json.dumps(photo_urls),
                    "url": url,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(known_ids=None, limit=None, log=print):
    """Full pipeline: fetch, filter, enrich, convert to GeoJSON."""
    log("Fetching Funda rentals...")
    listings = fetch_all_listings(log, limit=limit)
    filtered = filter_listings(listings, log)
    coords, details = enrich_with_coordinates(filtered, log=log)
    geojson = to_geojson(filtered, coords, details)
    log(f"  {len(geojson['features'])} features with coordinates")
    return geojson
