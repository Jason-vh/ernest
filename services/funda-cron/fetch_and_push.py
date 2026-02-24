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
        timeout=60,
    )

    if resp.status_code != 200:
        print(f"ERROR: Server returned {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)

    result = resp.json()
    print(f"  Server response: {result}")
    return result


def main():
    geojson = fetch_and_build_geojson()
    push_to_server(geojson)
    print("Done!")


if __name__ == "__main__":
    main()
