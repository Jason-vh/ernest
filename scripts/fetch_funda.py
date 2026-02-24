#!/usr/bin/env python3.13
"""Fetch Funda listings for Amsterdam and output as GeoJSON to stdout."""

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "funda-cron"))
from funda_core import fetch_and_build_geojson


def log_stderr(msg):
    print(msg, file=sys.stderr)


def main():
    geojson = fetch_and_build_geojson(log=log_stderr)
    json.dump(geojson, sys.stdout)


if __name__ == "__main__":
    main()
