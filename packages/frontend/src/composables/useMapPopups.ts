import maplibregl from "maplibre-gl";
import { getGeoJSONSource } from "@/geo/map-utils";

const cell = (url: string) => `<div style="background-image:url(${url})"></div>`;

interface PopupDeps {
  map: maplibregl.Map;
  funda: GeoJSON.FeatureCollection;
  markFundaClicked: (url: string) => void;
  clickedFundaUrls: { value: Set<string> };
  stampClickedState: (fc: GeoJSON.FeatureCollection) => GeoJSON.FeatureCollection;
  updateBuildingHighlights: () => void;
  resetBuildingViewKey: () => void;
  showRoutesForListing: (lat: number, lon: number, listingUrl: string) => void;
  clearRoutes: () => void;
}

export function useMapPopups(deps: PopupDeps) {
  const {
    map,
    funda,
    markFundaClicked,
    stampClickedState,
    updateBuildingHighlights,
    resetBuildingViewKey,
    showRoutesForListing,
    clearRoutes,
  } = deps;

  let fundaPopup: maplibregl.Popup | null = null;
  let fundaCloseTimer: ReturnType<typeof setTimeout> | null = null;

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

    let photos: string[] = [];
    try {
      photos = JSON.parse(p.photos || "[]");
    } catch {
      if (p.photo) photos = [p.photo];
    }

    let gridHtml = "";
    if (photos.length >= 3) {
      gridHtml =
        `<div class="funda-grid funda-grid--3">` +
        cell(photos[0]) +
        cell(photos[1]) +
        cell(photos[2]) +
        `</div>`;
    } else if (photos.length === 2) {
      gridHtml =
        `<div class="funda-grid funda-grid--2">` + cell(photos[0]) + cell(photos[1]) + `</div>`;
    } else if (photos.length === 1) {
      gridHtml = `<div class="funda-grid funda-grid--1">` + cell(photos[0]) + `</div>`;
    }

    if (fundaPopup) fundaPopup.remove();
    fundaPopup = new maplibregl.Popup({
      offset: 12,
      closeButton: false,
      maxWidth: "none",
      className: "funda-popup",
    })
      .setLngLat(coords)
      .setHTML(
        `<a href="${p.url}" target="_blank" rel="noopener" class="funda-popup-link">` +
          gridHtml +
          `<div class="funda-bar">` +
          `<div>` +
          `<div class="funda-bar-price">${fmtOverbid}</div>` +
          `<div class="funda-bar-asking">asking ${fmtList}</div>` +
          `</div>` +
          (details ? `<div class="funda-bar-details">${details}</div>` : "") +
          `</div>` +
          `</a>` +
          `<div class="funda-cycling-times"></div>`,
      )
      .addTo(map);

    // Track click to mark listing as visited
    const linkEl = fundaPopup.getElement()?.querySelector(".funda-popup-link");
    if (linkEl) {
      linkEl.addEventListener("click", () => {
        markFundaClicked(p.url);
        // Update source data so dot turns grey
        const src = getGeoJSONSource(map, "funda");
        if (src) src.setData(stampClickedState(funda));
        // Refresh building highlights to update colors
        resetBuildingViewKey();
        updateBuildingHighlights();
      });
    }
  }

  function scheduleFundaClose() {
    if (fundaCloseTimer) clearTimeout(fundaCloseTimer);
    fundaCloseTimer = setTimeout(() => {
      if (fundaPopup) {
        fundaPopup.remove();
        fundaPopup = null;
      }
      clearRoutes();
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

  function triggerRoutesForFeature(feature: maplibregl.MapGeoJSONFeature | GeoJSON.Feature) {
    const p = feature.properties ?? {};
    const geom = feature.geometry;
    if (p.url && geom.type === "Point") {
      const coords = geom.coordinates;
      showRoutesForListing(coords[1], coords[0], p.url);
    }
  }

  map.on("mouseenter", "funda-circles", (e) => {
    map.getCanvas().style.cursor = "pointer";
    cancelFundaClose();
    if (e.features && e.features.length > 0) {
      showFundaPopup(e.features[0]);
      attachPopupHover();
      triggerRoutesForFeature(e.features[0]);
    }
  });
  map.on("mouseleave", "funda-circles", () => {
    map.getCanvas().style.cursor = "";
    scheduleFundaClose();
  });

  // Touch fallback: tap to open, tap elsewhere to close
  map.on("click", "funda-circles", (e) => {
    if (e.features && e.features.length > 0) {
      cancelFundaClose();
      showFundaPopup(e.features[0]);
      triggerRoutesForFeature(e.features[0]);
    }
  });

  // --- Building highlight interaction handlers ---
  map.on("mouseenter", "funda-building-fill", (e) => {
    map.getCanvas().style.cursor = "pointer";
    cancelFundaClose();
    if (e.features && e.features.length > 0) {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      showFundaPopup(e.features[0], lngLat);
      attachPopupHover();
      triggerRoutesForFeature(e.features[0]);
    }
  });
  map.on("mouseleave", "funda-building-fill", () => {
    map.getCanvas().style.cursor = "";
    scheduleFundaClose();
  });
  map.on("click", "funda-building-fill", (e) => {
    if (e.features && e.features.length > 0) {
      cancelFundaClose();
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      showFundaPopup(e.features[0], lngLat);
      triggerRoutesForFeature(e.features[0]);
    }
  });
}
