#!/usr/bin/env python3
"""Fetch Funda listings and POST them to the web service for refresh."""

import os
import sys
import requests
from funda_core import fetch_and_build_geojson


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
    """Fetch the set of known listing IDs from the backend to skip redundant WOZ fetches."""
    refresh_url = os.environ.get("REFRESH_URL", "")
    refresh_secret = os.environ.get("REFRESH_SECRET", "")
    # Derive base URL from refresh URL (strip the path)
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


def main():
    known_ids = fetch_known_ids()
    geojson = fetch_and_build_geojson(known_ids=known_ids)
    push_to_server(geojson)
    print("Done!")


if __name__ == "__main__":
    main()
