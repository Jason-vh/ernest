#!/usr/bin/env python3
"""Fetch rentals (Funda + Vesteda + VB&T) and POST them to the web service."""

import argparse
import json
import os
import sys

import requests

from funda_core import fetch_and_build_geojson as fetch_funda
from vesteda_core import fetch_and_build_geojson as fetch_vesteda, normalize_address
from vbt_core import fetch_and_build_geojson as fetch_vbt


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
        timeout=600,
    )

    if resp.status_code != 200:
        print(f"ERROR: Server returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    result = resp.json()
    print(f"  Server response: {result}")
    return result


def fetch_known_ids():
    refresh_url = os.environ.get("REFRESH_URL", "")
    refresh_secret = os.environ.get("REFRESH_SECRET", "")
    base_url = refresh_url.rsplit("/api/", 1)[0] if "/api/" in refresh_url else ""
    if not base_url or not refresh_secret:
        return None
    try:
        resp = requests.get(
            f"{base_url}/api/internal/known-listings",
            headers={"Authorization": f"Bearer {refresh_secret}"},
            timeout=30,
        )
        if resp.status_code == 200:
            ids = resp.json()
            print(f"  Got {len(ids)} known listing IDs from backend")
            return set(ids)
    except Exception as e:
        print(f"  Warning: failed to fetch known IDs: {e}")
    return None


def merge_and_dedup(funda_geojson, *secondary_geojsons_with_labels):
    """Combine sources. Duplicates (same address) are merged: the secondary source's
    URL is appended to the primary feature's `sources` list rather than dropped."""
    funda_features = funda_geojson.get("features", [])

    # Seed sources for every primary feature
    for f in funda_features:
        props = f.setdefault("properties", {})
        props["sources"] = json.dumps([{"source": props.get("source"), "url": props.get("url")}])

    # address → feature index for merge lookups
    address_to_feature = {}
    for f in funda_features:
        norm = normalize_address((f.get("properties") or {}).get("address", ""))
        if norm:
            address_to_feature[norm] = f

    result_features = list(funda_features)

    for label, geojson in secondary_geojsons_with_labels:
        features = geojson.get("features", [])
        merged = 0
        for feature in features:
            props = feature.setdefault("properties", {})
            addr = props.get("address", "")
            norm = normalize_address(addr)
            if norm and norm in address_to_feature:
                # Merge: append this source to the primary feature's sources list
                primary_props = address_to_feature[norm].get("properties") or {}
                existing = json.loads(primary_props.get("sources", "[]"))
                existing.append({"source": props.get("source"), "url": props.get("url")})
                primary_props["sources"] = json.dumps(existing)
                merged += 1
                continue
            props["sources"] = json.dumps([{"source": props.get("source"), "url": props.get("url")}])
            result_features.append(feature)
            if norm:
                address_to_feature[norm] = feature
        if merged:
            print(f"  Dedup: merged {merged} {label} listing(s) with existing")

    return {"type": "FeatureCollection", "features": result_features}


def main():
    parser = argparse.ArgumentParser(description="Fetch and push rental listings.")
    parser.add_argument("--limit", type=int, help="Limit listings per source")
    parser.add_argument("--skip-vesteda", action="store_true")
    parser.add_argument("--skip-funda", action="store_true")
    parser.add_argument("--skip-vbt", action="store_true")
    args = parser.parse_args()

    known_ids = fetch_known_ids()

    funda_gj = {"type": "FeatureCollection", "features": []}
    if not args.skip_funda:
        try:
            funda_gj = fetch_funda(known_ids=known_ids, limit=args.limit)
        except Exception as e:
            print(f"ERROR: Funda fetch failed: {e}", file=sys.stderr)

    vesteda_gj = {"type": "FeatureCollection", "features": []}
    if not args.skip_vesteda:
        try:
            vesteda_gj = fetch_vesteda(limit=args.limit)
        except Exception as e:
            print(f"ERROR: Vesteda fetch failed: {e}", file=sys.stderr)

    vbt_gj = {"type": "FeatureCollection", "features": []}
    if not args.skip_vbt:
        try:
            vbt_gj = fetch_vbt(limit=args.limit)
        except Exception as e:
            print(f"ERROR: VB&T fetch failed: {e}", file=sys.stderr)

    combined = merge_and_dedup(
        funda_gj,
        ("Vesteda", vesteda_gj),
        ("VB&T", vbt_gj),
    )
    if not combined["features"]:
        print("ERROR: no features to push", file=sys.stderr)
        sys.exit(1)
    push_to_server(combined)
    print("Done!")


if __name__ == "__main__":
    main()
