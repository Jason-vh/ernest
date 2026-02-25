import maplibregl from "maplibre-gl";
import type { Listing } from "@ernest/shared";

function createCell(url: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.backgroundImage = `url("${url.replace(/["\\]/g, "")}")`;
  return el;
}

/** Collect unique fundaIds from an array of map features (circle/hitarea layers). */
function collectUniqueFundaIds(features: maplibregl.MapGeoJSONFeature[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const f of features) {
    const id = f.properties?.fundaId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

interface PopupDeps {
  map: maplibregl.Map;
  listings: { value: Map<string, Listing> };
  selectListing: (fundaId: string, opts?: { clusterIds?: string[] }) => void;
  fundaFavouriteVisible: { value: boolean };
  fundaUnreviewedVisible: { value: boolean };
  fundaDiscardedVisible: { value: boolean };
}

export function useMapPopups(deps: PopupDeps) {
  const {
    map,
    listings,
    selectListing,
    fundaFavouriteVisible,
    fundaUnreviewedVisible,
    fundaDiscardedVisible,
  } = deps;

  let fundaPopup: maplibregl.Popup | null = null;
  let fundaCloseTimer: ReturnType<typeof setTimeout> | null = null;
  const hasHover = window.matchMedia("(hover: hover)").matches;

  function showFundaPopup(
    feature: maplibregl.MapGeoJSONFeature | GeoJSON.Feature,
    lngLatOverride?: [number, number],
  ) {
    const geom = feature.geometry;
    const coords =
      lngLatOverride ??
      (geom.type === "Point" ? (geom.coordinates.slice() as [number, number]) : null);
    if (!coords) return;

    const p = feature.properties ?? {};

    const listPrice = Number(p.price);
    const overbidPrice = Math.round(listPrice * 1.15);
    const fmtOverbid = `\u20AC${overbidPrice.toLocaleString("nl-NL")}`;
    const fmtList = `\u20AC${listPrice.toLocaleString("nl-NL")}`;
    const details = [
      p.livingArea ? `${p.livingArea} m\u00B2` : null,
      p.bedrooms ? `${p.bedrooms} bedrooms` : null,
    ]
      .filter(Boolean)
      .join(" \u00B7 ");

    // Get photos from the listing store (GeoJSON only has first photo)
    const listing = listings.value.get(p.fundaId);
    const photos: string[] = listing ? listing.photos : p.photo ? [p.photo] : [];

    // Count visible co-located listings (use store coordinates, not mouse position)
    let visibleColocated = 0;
    if (listing) {
      const { longitude: lng, latitude: lat } = listing;
      for (const l of listings.value.values()) {
        if (l.longitude !== lng || l.latitude !== lat) continue;
        const cat =
          l.reaction === "favourite"
            ? "favourite"
            : l.reaction === "discarded"
              ? "discarded"
              : "unreviewed";
        if (
          (cat === "favourite" && fundaFavouriteVisible.value) ||
          (cat === "unreviewed" && fundaUnreviewedVisible.value) ||
          (cat === "discarded" && fundaDiscardedVisible.value)
        ) {
          visibleColocated++;
        }
      }
    }

    // Build popup DOM
    const container = document.createElement("div");

    const inner = document.createElement("div");
    inner.className = "funda-popup-inner";

    // Photo grid
    const gridCount = Math.min(photos.length, 3);
    if (gridCount > 0) {
      const grid = document.createElement("div");
      grid.className = `funda-grid funda-grid--${gridCount}`;
      for (let i = 0; i < gridCount; i++) {
        grid.appendChild(createCell(photos[i]));
      }
      inner.appendChild(grid);
    }

    // Listings count pill (top-right)
    if (visibleColocated > 1) {
      const pill = document.createElement("div");
      pill.className = "funda-count-pill";
      pill.textContent = `${visibleColocated} listings`;
      inner.appendChild(pill);
    }

    // Price bar
    const bar = document.createElement("div");
    bar.className = "funda-bar";

    const priceGroup = document.createElement("div");
    const priceEl = document.createElement("div");
    priceEl.className = "funda-bar-price";
    priceEl.textContent = fmtOverbid;
    priceGroup.appendChild(priceEl);
    const askingEl = document.createElement("div");
    askingEl.className = "funda-bar-asking";
    askingEl.textContent = `asking ${fmtList}`;
    priceGroup.appendChild(askingEl);
    bar.appendChild(priceGroup);

    if (details) {
      const detailsEl = document.createElement("div");
      detailsEl.className = "funda-bar-details";
      detailsEl.textContent = details;
      bar.appendChild(detailsEl);
    }
    inner.appendChild(bar);
    container.appendChild(inner);

    if (fundaPopup) fundaPopup.remove();
    fundaPopup = new maplibregl.Popup({
      offset: 12,
      closeButton: false,
      maxWidth: "none",
      className: "funda-popup",
    })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map);
  }

  function closeFundaPopup() {
    if (fundaPopup) {
      fundaPopup.remove();
      fundaPopup = null;
    }
  }

  function scheduleFundaClose() {
    if (fundaCloseTimer) clearTimeout(fundaCloseTimer);
    fundaCloseTimer = setTimeout(() => {
      closeFundaPopup();
    }, 200);
  }

  function cancelFundaClose() {
    if (fundaCloseTimer) {
      clearTimeout(fundaCloseTimer);
      fundaCloseTimer = null;
    }
  }

  function attachPopupHover() {
    const el = fundaPopup?.getElement();
    if (el) {
      el.addEventListener("mouseenter", cancelFundaClose);
      el.addEventListener("mouseleave", scheduleFundaClose);
    }
  }

  // Prevent double-firing from overlapping layers (hitarea fires first, then circles, then building-fill)
  let clickHandled = false;

  function handleFeatureClick(fundaIds: string[]) {
    if (clickHandled || fundaIds.length === 0) return;
    clickHandled = true;
    requestAnimationFrame(() => {
      clickHandled = false;
    });

    closeFundaPopup();
    cancelFundaClose();
    selectListing(fundaIds[0], fundaIds.length > 1 ? { clusterIds: fundaIds } : undefined);
  }

  // Hover popups: desktop only (devices with a fine pointer)
  if (hasHover) {
    map.on("mouseenter", "funda-circles", (e) => {
      map.getCanvas().style.cursor = "pointer";
      cancelFundaClose();
      if (e.features && e.features.length > 0) {
        showFundaPopup(e.features[0]);
        attachPopupHover();
      }
    });
    map.on("mouseleave", "funda-circles", () => {
      map.getCanvas().style.cursor = "";
      scheduleFundaClose();
    });

    map.on("mouseenter", "funda-building-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
      cancelFundaClose();
      if (e.features && e.features.length > 0) {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        showFundaPopup(e.features[0], lngLat);
        attachPopupHover();
      }
    });
    map.on("mouseleave", "funda-building-fill", () => {
      map.getCanvas().style.cursor = "";
      scheduleFundaClose();
    });
  }

  /** Query the building-fill layer at a point for the full fundaIds list. */
  function getBuildingFundaIds(point: maplibregl.Point): string[] | null {
    const buildings = map.queryRenderedFeatures(point, {
      layers: ["funda-building-fill"],
    });
    if (buildings.length > 0) {
      const raw = buildings[0].properties?.fundaIds;
      if (raw) return JSON.parse(raw);
    }
    return null;
  }

  // Click: open modal (both desktop and touch, via visible dots + hit-area layer)
  // Circle/hitarea handlers check the building layer underneath to pick up all
  // co-located listings (circles only return the single feature you clicked on).
  map.on("click", "funda-circles", (e) => {
    if (e.features && e.features.length > 0) {
      const ids = getBuildingFundaIds(e.point) ?? collectUniqueFundaIds(e.features);
      handleFeatureClick(ids);
    }
  });
  map.on("click", "funda-circles-hitarea", (e) => {
    if (e.features && e.features.length > 0) {
      const ids = getBuildingFundaIds(e.point) ?? collectUniqueFundaIds(e.features);
      handleFeatureClick(ids);
    }
  });
  map.on("click", "funda-building-fill", (e) => {
    if (e.features && e.features.length > 0) {
      const props = e.features[0].properties;
      if (props?.fundaIds) {
        const ids: string[] = JSON.parse(props.fundaIds);
        handleFeatureClick(ids);
      } else {
        const fundaId = props?.fundaId;
        if (fundaId) handleFeatureClick([fundaId]);
      }
    }
  });

  return { closeFundaPopup };
}
