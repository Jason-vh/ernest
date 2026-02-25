import maplibregl from "maplibre-gl";
import type { Listing } from "@ernest/shared";
import { OFFICES, COLORS } from "@/geo/constants";

const cell = (url: string) => `<div style="background-image:url(${url})"></div>`;

interface PopupDeps {
  map: maplibregl.Map;
  listings: { value: Map<string, Listing> };
  selectListing: (fundaId: string) => void;
  refreshFundaSource: () => void;
  updateBuildingHighlights: () => void;
  resetBuildingViewKey: () => void;
}

function buildCyclingTimesHtml(listing: Listing): string {
  const parts: string[] = [];
  if (listing.routeFareharbor) {
    parts.push(
      `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeFareharbor}"></span><span style="color:${COLORS.routeFareharbor}">${listing.routeFareharbor} min</span> to ${OFFICES.fareharbor.name}</span>`,
    );
  }
  if (listing.routeAirwallex) {
    parts.push(
      `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeAirwallex}"></span><span style="color:${COLORS.routeAirwallex}">${listing.routeAirwallex} min</span> to ${OFFICES.airwallex.name}</span>`,
    );
  }
  return parts.join("");
}

export function useMapPopups(deps: PopupDeps) {
  const {
    map,
    listings,
    selectListing,
    refreshFundaSource,
    updateBuildingHighlights,
    resetBuildingViewKey,
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

    // Get photos from the listing store (GeoJSON only has first photo)
    const listing = listings.value.get(p.fundaId);
    const photos: string[] = listing ? listing.photos : p.photo ? [p.photo] : [];

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

    // Build cycling times inline from listing store data
    const cyclingHtml = listing ? buildCyclingTimesHtml(listing) : "";

    if (fundaPopup) fundaPopup.remove();
    fundaPopup = new maplibregl.Popup({
      offset: 12,
      closeButton: false,
      maxWidth: "none",
      className: "funda-popup",
    })
      .setLngLat(coords)
      .setHTML(
        `<div class="funda-popup-inner">` +
          gridHtml +
          `<div class="funda-bar">` +
          `<div>` +
          `<div class="funda-bar-price">${fmtOverbid}</div>` +
          `<div class="funda-bar-asking">asking ${fmtList}</div>` +
          `</div>` +
          (details ? `<div class="funda-bar-details">${details}</div>` : "") +
          `</div>` +
          `</div>` +
          `<div class="funda-cycling-times">${cyclingHtml}</div>`,
      )
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

  function handleFeatureClick(feature: maplibregl.MapGeoJSONFeature | GeoJSON.Feature) {
    const fundaId = feature.properties?.fundaId;
    if (!fundaId) return;

    closeFundaPopup();
    cancelFundaClose();
    selectListing(fundaId);
    refreshFundaSource();
    resetBuildingViewKey();
    updateBuildingHighlights();
  }

  // Hover: show popup (desktop only — mouseenter doesn't fire on touch)
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

  // Click: always open modal (both desktop and touch)
  map.on("click", "funda-circles", (e) => {
    if (e.features && e.features.length > 0) {
      handleFeatureClick(e.features[0]);
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
    }
  });
  map.on("mouseleave", "funda-building-fill", () => {
    map.getCanvas().style.cursor = "";
    scheduleFundaClose();
  });
  map.on("click", "funda-building-fill", (e) => {
    if (e.features && e.features.length > 0) {
      handleFeatureClick(e.features[0]);
    }
  });

  return { closeFundaPopup };
}
