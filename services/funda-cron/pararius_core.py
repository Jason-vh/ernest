"""Pull Pararius rental listings via HTML scraping.

Uses curl_cffi to impersonate Chrome at the TLS level, bypassing Cloudflare
protection. Scrapes paginated search results, then fetches each detail page
for coordinates, photos, and description. Nominatim geocoding is used as a
fallback when coordinates can't be extracted from the page.
"""

import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

from bs4 import BeautifulSoup
from curl_cffi import requests

BASE_URL = "https://www.pararius.nl"
# Price and bedroom filter baked into the path; size filter applied post-fetch.
SEARCH_PATH = "/huurwoningen/amsterdam/0-3000/2-slaapkamers"
USER_AGENT = "mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/537.36 (khtml, like gecko) chrome/124.0.0.0 safari/537.36"
NOMINATIM_UA = "ernest-pararius-cron/1.0 (+https://ernest.vhtm.eu)"
HTTP_TIMEOUT = 30
DETAIL_WORKERS = 6
SEARCH_DELAY = 2.0  # seconds between search page requests

MIN_BEDROOMS = 2
MIN_LIVING_AREA_M2 = 70
MAX_RENT_EUR = 3000

_COORD_RE = re.compile(r'"latitude"\s*:\s*([\d.]+)\s*,\s*"longitude"\s*:\s*([\d.]+)')
_COORD_LL_RE = re.compile(r'"lat"\s*:\s*([\d.]+)\s*,\s*"lng"\s*:\s*([\d.]+)')
_CDN_HOST = "casco-media-prod.global.ssl.fastly.net"


def _session():
    s = requests.Session(impersonate="chrome124")
    s.headers.update({"Accept-Language": "nl-NL,nl;q=0.9"})
    return s


def _get(session, url, log=print):
    resp = session.get(url, timeout=HTTP_TIMEOUT)
    if resp.status_code == 403:
        log(f"  Warning: 403 on {url} (Cloudflare block)")
        return None
    resp.raise_for_status()
    return resp


def _parse_int(text: str) -> int | None:
    m = re.search(r"[\d.]+", text.replace(".", "").replace(",", ""))
    if m:
        try:
            return int(float(m.group().replace(".", "")))
        except ValueError:
            return None
    return None


def _parse_price(text: str) -> int | None:
    """Parse '€ 1.850 per maand' → 1850."""
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def _extract_coords_from_html(html: str) -> tuple[float, float] | None:
    """Try several patterns to find lat/lng embedded in the page."""
    for pattern in (_COORD_RE, _COORD_LL_RE):
        m = pattern.search(html)
        if m:
            try:
                lat, lng = float(m.group(1)), float(m.group(2))
                # Sanity-check: Amsterdam is ~52.37N, 4.90E
                if 52.0 < lat < 53.0 and 4.5 < lng < 5.5:
                    return lat, lng
            except ValueError:
                pass

    # JSON-LD blocks
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                geo = item.get("geo") or {}
                lat = geo.get("latitude")
                lng = geo.get("longitude")
                if lat and lng:
                    return float(lat), float(lng)
        except (json.JSONDecodeError, ValueError, AttributeError):
            pass

    return None


def _geocode_nominatim(address: str, postcode: str | None, log=print) -> tuple[float, float] | None:
    """Fall back to Nominatim when the page has no embedded coordinates."""
    query = f"{address}, Amsterdam, Netherlands"
    if postcode:
        query = f"{address}, {postcode}, Netherlands"
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "nl"},
            headers={"User-Agent": NOMINATIM_UA},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            lat = float(results[0]["lat"])
            lng = float(results[0]["lon"])
            if 52.0 < lat < 53.0 and 4.5 < lng < 5.5:
                return lat, lng
    except Exception as e:
        log(f"  Nominatim warning for '{address}': {e}")
    return None


def _reverse_geocode(lat: float, lng: float, log=print) -> dict:
    """Reverse-geocode coordinates to get full address, postcode, neighbourhood."""
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
            headers={"User-Agent": NOMINATIM_UA},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        addr = data.get("address") or {}
        road = addr.get("road") or ""
        number = addr.get("house_number") or ""
        full_address = f"{road} {number}".strip() if number else road
        postcode = addr.get("postcode", "").replace(" ", "") or None
        neighbourhood = (
            addr.get("neighbourhood")
            or addr.get("suburb")
            or addr.get("quarter")
            or None
        )
        return {"address": full_address or None, "postcode": postcode, "neighbourhood": neighbourhood}
    except Exception as e:
        log(f"  Reverse geocode warning ({lat},{lng}): {e}")
    return {}


def fetch_search_page(session, page: int, log=print) -> list[dict]:
    """Fetch one search result page; return list of raw listing dicts."""
    if page == 1:
        url = f"{BASE_URL}{SEARCH_PATH}"
    else:
        url = f"{BASE_URL}{SEARCH_PATH}/pagina-{page}"

    resp = _get(session, url, log)
    if resp is None:
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    listings = []
    for card in soup.select("section.listing-search-item, li.search-list__item--listing"):
        link_el = card.select_one("a.listing-search-item__link--title, a.listing-search-item__link")
        if not link_el:
            continue
        href = link_el.get("href") or ""
        if not href:
            continue
        full_url = href if href.startswith("http") else f"{BASE_URL}{href}"

        # Extract ID from URL, e.g. /appartement-te-huur/amsterdam/7311d857/street-name
        slug_match = re.search(r"/amsterdam/([a-z0-9]{6,})/", href)
        listing_id = slug_match.group(1) if slug_match else re.sub(r"[^a-z0-9-]", "", href.rsplit("/", 1)[-1])

        address_el = card.select_one(".listing-search-item__title, .listing-search-item__sub-title")
        address = address_el.get_text(strip=True) if address_el else link_el.get_text(strip=True)

        price_el = card.select_one(".listing-search-item__price")
        price_text = price_el.get_text(strip=True) if price_el else ""
        price = _parse_price(price_text)

        # Feature items: size, bedrooms
        bedrooms = None
        living_area = None
        for feat in card.select("li.illustrated-features__item"):
            text = feat.get_text(strip=True)
            if "slaapkamer" in text or "bedroom" in text.lower():
                bedrooms = _parse_int(text)
            elif "m²" in text or "m2" in text.lower():
                living_area = _parse_int(text)

        postcode_el = card.select_one(".listing-search-item__description")
        postcode = None
        if postcode_el:
            pc_match = re.search(r"\b(\d{4}\s?[A-Z]{2})\b", postcode_el.get_text())
            if pc_match:
                postcode = pc_match.group(1).replace(" ", "")

        listings.append({
            "id": listing_id,
            "url": full_url,
            "address": address,
            "price": price,
            "bedrooms": bedrooms,
            "living_area": living_area,
            "postcode": postcode,
        })

    return listings


def fetch_all_listings(log=print, limit=None) -> list[dict]:
    session = _session()
    all_listings = []
    seen_ids: set[str] = set()
    page = 1

    while True:
        log(f"  Fetching Pararius search page {page}...")
        listings = fetch_search_page(session, page, log)
        if not listings:
            log(f"  No listings on page {page}, stopping")
            break

        new = 0
        for lst in listings:
            lid = lst["id"]
            if lid and lid not in seen_ids:
                seen_ids.add(lid)
                all_listings.append(lst)
                new += 1
                if limit and len(all_listings) >= limit:
                    log(f"  Reached limit of {limit}")
                    return all_listings

        log(f"  Page {page}: {new} new listings (total {len(all_listings)})")
        if new == 0:
            break

        page += 1
        time.sleep(SEARCH_DELAY)

    log(f"  Fetched {len(all_listings)} total Pararius listings")
    return all_listings


def filter_listings(listings: list[dict], log=print) -> list[dict]:
    kept = []
    for lst in listings:
        price = lst.get("price")
        if not isinstance(price, int) or price <= 0 or price > MAX_RENT_EUR:
            continue
        bedrooms = lst.get("bedrooms")
        if isinstance(bedrooms, int) and bedrooms < MIN_BEDROOMS:
            continue
        living_area = lst.get("living_area")
        if isinstance(living_area, int) and living_area < MIN_LIVING_AREA_M2:
            continue
        kept.append(lst)

    log(f"  {len(kept)} Pararius listings after filtering")
    return kept


def _dt_value(soup: BeautifulSoup, label: str) -> str | None:
    """Find a dt with matching text and return the adjacent dd's text."""
    for dt in soup.select("dt.listing-features__term, dt"):
        if dt.get_text(strip=True) == label:
            dd = dt.find_next_sibling("dd")
            if dd:
                return dd.get_text(strip=True)
    return None


def _fetch_detail(listing: dict, log=print) -> dict:
    """Fetch detail page; extract coords, photos, description, energy label."""
    url = listing["url"]
    session = _session()
    try:
        resp = _get(session, url, log)
        if resp is None:
            return listing
        html = resp.text
    except Exception as e:
        log(f"  Warning: failed to fetch {url}: {e}")
        return listing

    soup = BeautifulSoup(html, "lxml")

    # Coordinates
    coords = _extract_coords_from_html(html)
    if coords:
        listing["latitude"], listing["longitude"] = coords

    # Photos — Pararius CDN is casco-media-prod.global.ssl.fastly.net
    # The CDN path starts with the listing's UUID, which begins with the listing ID (first 8 chars).
    listing_id = listing.get("id", "")
    seen: set[str] = set()
    photos = []
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if _CDN_HOST not in src or src.endswith(".svg") or src in seen:
            continue
        # Keep only photos whose CDN path UUID matches this listing
        path = src.split(_CDN_HOST, 1)[-1]
        if listing_id and not path.lstrip("/").startswith(listing_id):
            continue
        seen.add(src)
        photos.append(src)
    listing["photos"] = photos

    # Description
    desc_el = soup.select_one(
        ".listing-detail-description__additional, .listing-detail-description__body, "
        ".description__content, .listing-detail__description"
    )
    listing["description"] = desc_el.get_text("\n", strip=True) if desc_el else ""

    # Energy label: dt "Energielabel" → dd value
    label_raw = _dt_value(soup, "Energielabel")
    if label_raw:
        m = re.match(r"^([A-G][+]{0,3})$", label_raw.strip())
        if m:
            listing["energy_label"] = m.group(1)

    # Bedrooms: dt "Aantal slaapkamers" → dd value
    if not listing.get("bedrooms"):
        raw = _dt_value(soup, "Aantal slaapkamers")
        if raw:
            n = _parse_int(raw)
            if n:
                listing["bedrooms"] = n

    # Living area: dt "Woonoppervlakte" → dd value (e.g. "102 m²")
    if not listing.get("living_area"):
        raw = _dt_value(soup, "Woonoppervlakte")
        if raw:
            n = _parse_int(raw)
            if n:
                listing["living_area"] = n

    # Construction year
    raw = _dt_value(soup, "Bouwjaar")
    if raw:
        try:
            listing["construction_year"] = int(raw.strip())
        except ValueError:
            pass

    # Offered since
    if not listing.get("offered_since"):
        raw = _dt_value(soup, "Aangeboden sinds")
        if raw:
            listing["offered_since"] = raw

    # Postcode
    if not listing.get("postcode"):
        pc_m = re.search(r"\b(\d{4}\s?[A-Z]{2})\b", html)
        if pc_m:
            listing["postcode"] = pc_m.group(1).replace(" ", "")

    return listing


def enrich_with_details(listings: list[dict], log=print) -> list[dict]:
    log(f"  Fetching details for {len(listings)} Pararius listings ({DETAIL_WORKERS} workers)...")
    results = {}
    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(_fetch_detail, lst, log): lst["id"] for lst in listings}
        done = 0
        for future in as_completed(futures):
            enriched = future.result()
            results[enriched["id"]] = enriched
            done += 1
            if done % 20 == 0:
                log(f"    {done}/{len(listings)} fetched...")

    # Geocode any listings still missing coordinates (sequentially, rate-limited)
    missing = [r for r in results.values() if "latitude" not in r]
    if missing:
        log(f"  Geocoding {len(missing)} listings via Nominatim...")
        for lst in missing:
            coords = _geocode_nominatim(lst["address"], lst.get("postcode"), log)
            if coords:
                lst["latitude"], lst["longitude"] = coords
            time.sleep(1.1)  # Nominatim rate limit: 1 req/sec

    # Reverse-geocode to get full address (with house number) + neighbourhood
    with_coords = [r for r in results.values() if "latitude" in r]
    log(f"  Reverse-geocoding {len(with_coords)} listings for full addresses...")
    for lst in with_coords:
        geo = _reverse_geocode(lst["latitude"], lst["longitude"], log)
        if geo.get("address"):
            lst["address"] = geo["address"]
        if geo.get("postcode") and not lst.get("postcode"):
            lst["postcode"] = geo["postcode"]
        if geo.get("neighbourhood") and not lst.get("neighbourhood"):
            lst["neighbourhood"] = geo["neighbourhood"]
        time.sleep(1.1)  # Nominatim rate limit: 1 req/sec

    found = sum(1 for r in results.values() if "latitude" in r)
    log(f"  Got coordinates for {found}/{len(listings)}")
    return list(results.values())


def to_geojson(listings: list[dict]) -> dict:
    features = []
    for lst in listings:
        lat = lst.get("latitude")
        lng = lst.get("longitude")
        if lat is None or lng is None:
            continue
        photos = lst.get("photos") or []
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "fundaId": f"pararius-{lst['id']}",
                "source": "pararius",
                "price": lst.get("price"),
                "address": lst.get("address") or "",
                "bedrooms": lst.get("bedrooms"),
                "livingArea": lst.get("living_area"),
                "energyLabel": lst.get("energy_label") or None,
                "objectType": None,
                "houseType": None,
                "constructionYear": lst.get("construction_year") or None,
                "postcode": lst.get("postcode") or None,
                "city": "Amsterdam",
                "neighbourhood": lst.get("neighbourhood") or None,
                "description": lst.get("description") or "",
                "offeredSince": lst.get("offered_since") or None,
                "hasGarden": None,
                "hasBalcony": None,
                "hasRoofTerrace": None,
                "status": "Beschikbaar",
                "photos": json.dumps(photos),
                "url": lst.get("url") or "",
            },
        })
    return {"type": "FeatureCollection", "features": features}


def fetch_and_build_geojson(log=print, limit=None) -> dict:
    log("Fetching Pararius rentals...")
    listings = fetch_all_listings(log, limit=limit)
    listings = filter_listings(listings, log)
    listings = enrich_with_details(listings, log)
    geojson = to_geojson(listings)
    log(f"  Pararius: {len(geojson['features'])} features ready")
    return geojson
