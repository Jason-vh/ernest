"""Shared Funda listing fetch, filter, and GeoJSON conversion logic."""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from funda import Funda

PRICE_MIN = 450000
PRICE_MAX = 600000
MIN_BEDROOMS = 2
MIN_LIVING_AREA = 65
ACCEPTABLE_LABELS = {"A+++", "A++", "A+", "A", "B", "C", "D", "unknown"}
DETAIL_WORKERS = 8
SEARCH_AREAS = ["amsterdam", "diemen", "duivendrecht", "amstelveen", "ouderkerk-aan-de-amstel"]


def fetch_all_listings(log=print):
    f = Funda(timeout=30)
    all_listings = []
    seen_ids = set()
    page = 0

    while True:
        log(f"  Fetching page {page}...")
        results = f.search_listing(
            SEARCH_AREAS,
            offering_type="buy",
            price_min=PRICE_MIN,
            price_max=PRICE_MAX,
            page=page,
        )
        if not results:
            break
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
                    "photos": json.dumps(photo_urls),
                    "url": url,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(log=print):
    """Full pipeline: fetch, filter, enrich, convert to GeoJSON."""
    log("Fetching Funda listings...")
    listings = fetch_all_listings(log)
    filtered = filter_listings(listings, log)
    coords, details = enrich_with_coordinates(filtered, log)
    geojson = to_geojson(filtered, coords, details)
    log(f"  {len(geojson['features'])} features with coordinates")
    return geojson
