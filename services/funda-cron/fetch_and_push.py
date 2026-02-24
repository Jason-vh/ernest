#!/usr/bin/env python3
"""Fetch Funda listings and POST them to the web service for refresh."""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from funda import Funda
import requests

PRICE_MIN = 450000
PRICE_MAX = 600000
MIN_BEDROOMS = 2
MIN_LIVING_AREA = 65
ACCEPTABLE_LABELS = {"A+++", "A++", "A+", "A", "B", "C", "D"}
DETAIL_WORKERS = 8


def fetch_all_listings():
    f = Funda(timeout=30)
    all_listings = []
    page = 0

    while True:
        print(f"  Fetching page {page}...")
        results = f.search_listing(
            "amsterdam",
            offering_type="buy",
            price_min=PRICE_MIN,
            price_max=PRICE_MAX,
            page=page,
        )
        if not results:
            break
        all_listings.extend(results)
        page += 1
        time.sleep(1)

    print(f"  Fetched {len(all_listings)} total listings")
    return all_listings


def filter_listings(listings):
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

    print(f"  {len(filtered)} listings after filtering")
    return filtered


def fetch_detail(global_id):
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
        print(f"  Warning: failed to fetch {global_id}: {e}")
    return global_id, None, None, None


def enrich_with_coordinates(listings):
    """Fetch coordinates for all listings using parallel requests."""
    print(f"  Fetching details for {len(listings)} listings ({DETAIL_WORKERS} workers)...")
    coords = {}
    details = {}
    ids = [l.get("global_id") for l in listings if l.get("global_id")]

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(fetch_detail, gid): gid for gid in ids}
        done = 0
        for future in as_completed(futures):
            gid, lat, lng, detail = future.result()
            if lat is not None:
                coords[gid] = (lat, lng)
                details[gid] = detail
            done += 1
            if done % 50 == 0:
                print(f"    {done}/{len(ids)} fetched...")

    print(f"  Got coordinates for {len(coords)}/{len(ids)} listings")
    return coords, details


def to_geojson(listings, coords, details):
    features = []
    for listing in listings:
        gid = listing.get("global_id")
        if gid not in coords:
            continue

        lat, lng = coords[gid]
        detail = details.get(gid)

        price_formatted = ""
        url = ""
        photo = ""
        photos = []
        status = ""
        if detail:
            try:
                price_formatted = detail.get("price_formatted") or ""
            except Exception:
                pass
            try:
                url = detail.get("url") or ""
            except Exception:
                pass
            try:
                photo_urls = detail.get("photo_urls") or []
                if photo_urls:
                    photo = photo_urls[0]
                    photos = photo_urls[:3]
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

        if status and status != "Beschikbaar":
            continue

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "price": listing.get("price"),
                    "priceFormatted": price_formatted,
                    "address": listing.get("title") or "",
                    "bedrooms": listing.get("bedrooms"),
                    "livingArea": listing.get("living_area"),
                    "photo": photo,
                    "photos": json.dumps(photos),
                    "url": url,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def push_to_server(geojson):
    """POST geojson to the web service refresh endpoint."""
    refresh_url = os.environ.get("REFRESH_URL")
    refresh_secret = os.environ.get("REFRESH_SECRET")

    if not refresh_url:
        print("ERROR: REFRESH_URL not set", file=sys.stderr)
        sys.exit(1)
    if not refresh_secret:
        print("ERROR: REFRESH_SECRET not set", file=sys.stderr)
        sys.exit(1)

    print(f"  POSTing {len(geojson['features'])} features to {refresh_url}...")
    resp = requests.post(
        refresh_url,
        json=geojson,
        headers={
            "Authorization": f"Bearer {refresh_secret}",
            "Content-Type": "application/json",
        },
        timeout=60,
    )

    if resp.status_code != 200:
        print(f"ERROR: Server returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    result = resp.json()
    print(f"  Server response: {result}")
    return result


def main():
    print("Fetching Funda listings...")
    listings = fetch_all_listings()
    filtered = filter_listings(listings)
    coords, details = enrich_with_coordinates(filtered)
    geojson = to_geojson(filtered, coords, details)
    print(f"  {len(geojson['features'])} features with coordinates")

    push_to_server(geojson)
    print("Done!")


if __name__ == "__main__":
    main()
