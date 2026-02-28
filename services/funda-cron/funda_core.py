"""Shared Funda listing fetch, filter, and GeoJSON conversion logic."""

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from funda import Funda

PRICE_MIN = 450000
PRICE_MAX = 513000
MIN_BEDROOMS = 2
MIN_LIVING_AREA = 65
ACCEPTABLE_LABELS = {"A+++", "A++", "A+", "A", "B", "C", "D", "unknown"}
DETAIL_WORKERS = 8
SEARCH_AREAS = ["amsterdam", "diemen", "duivendrecht", "amstelveen", "ouderkerk-aan-de-amstel"]


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


def fetch_all_listings(log=print):
    f = Funda(timeout=30)
    all_listings = []
    seen_ids = set()
    page = 0
    fetched_any_page = False
    tried_one_based_fallback = False

    while True:
        log(f"  Fetching page {page}...")
        try:
            results = f.search_listing(
                SEARCH_AREAS,
                offering_type="buy",
                price_min=PRICE_MIN,
                price_max=PRICE_MAX,
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
                log(f"  Reached last page at page {page - 1} (page {page} returned 400)")
                break
            raise
        if not results:
            break
        fetched_any_page = True
        for listing in results:
            gid = listing.get("global_id")
            if gid and gid not in seen_ids:
                seen_ids.add(gid)
                all_listings.append(listing)
        page += 1
        time.sleep(1)

    log(f"  Fetched {len(all_listings)} total unique listings")
    return all_listings


def filter_listings(listings, log=print):
    filtered = []
    for listing in listings:
        bedrooms = listing.get("bedrooms")
        if bedrooms is None or bedrooms < MIN_BEDROOMS:
            continue

        living_area = listing.get("living_area")
        if living_area is None or living_area < MIN_LIVING_AREA:
            continue

        energy_label = listing.get("energy_label") or ""
        if energy_label not in ACCEPTABLE_LABELS:
            continue

        filtered.append(listing)

    log(f"  {len(filtered)} listings after filtering")
    return filtered


def _fetch_detail(global_id, known_ids=None, log=print):
    """Fetch individual listing to get coordinates and optionally WOZ value."""
    try:
        f = Funda(timeout=30)
        detail = f.get_listing(global_id)
        if detail:
            lat = detail.get("latitude")
            lng = detail.get("longitude")
            if lat is not None and lng is not None:
                # Fetch WOZ value for new listings (not already in DB)
                if known_ids is None or global_id not in known_ids:
                    try:
                        url = detail.get("url") or ""
                        if url:
                            history = f.get_price_history(url)
                            woz_entries = [e for e in history if e.get("source") == "WOZ"]
                            if woz_entries:
                                # Most recent WOZ is the last entry
                                detail["_woz_value"] = woz_entries[-1].get("price")
                    except Exception as e:
                        log(f"  Warning: failed to fetch WOZ for {global_id}: {e}")
                return global_id, float(lat), float(lng), detail
    except Exception as e:
        log(f"  Warning: failed to fetch {global_id}: {e}")
    return global_id, None, None, None


def enrich_with_coordinates(listings, known_ids=None, log=print):
    """Fetch coordinates for all listings using parallel requests."""
    log(f"  Fetching details for {len(listings)} listings ({DETAIL_WORKERS} workers)...")
    coords = {}
    details = {}
    ids = [l.get("global_id") for l in listings if l.get("global_id")]

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(_fetch_detail, gid, known_ids, log): gid for gid in ids}
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


def fetch_and_build_geojson(known_ids=None, log=print):
    """Full pipeline: fetch, filter, enrich, convert to GeoJSON."""
    log("Fetching Funda listings...")
    listings = fetch_all_listings(log)
    filtered = filter_listings(listings, log)
    coords, details = enrich_with_coordinates(filtered, known_ids=known_ids, log=log)
    geojson = to_geojson(filtered, coords, details)
    log(f"  {len(geojson['features'])} features with coordinates")
    return geojson
