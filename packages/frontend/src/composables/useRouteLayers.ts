import type { Ref } from "vue";
import { watch } from "vue";
import type maplibregl from "maplibre-gl";
import { OFFICES, COLORS } from "@/geo/constants";
import { getGeoJSONSource } from "@/geo/map-utils";
import type { CyclingRoutes } from "@/api/client";

const emptyFC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function routeToFeature(geometry: GeoJSON.LineString): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry, properties: {} }],
  };
}

export function useRouteLayers(
  map: maplibregl.Map,
  activeRoutes: Ref<CyclingRoutes | null>,
  routesLoading: Ref<boolean>,
) {
  map.addSource("cycling-route-fareharbor", {
    type: "geojson",
    data: emptyFC,
  });
  map.addSource("cycling-route-airwallex", {
    type: "geojson",
    data: emptyFC,
  });

  // FareHarbor route (teal, dashed)
  map.addLayer({
    id: "route-fareharbor-casing",
    type: "line",
    source: "cycling-route-fareharbor",
    paint: {
      "line-color": COLORS.routeFareharborCasing,
      "line-width": 2,
      "line-opacity": 0.2,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "route-fareharbor-fill",
    type: "line",
    source: "cycling-route-fareharbor",
    paint: {
      "line-color": COLORS.routeFareharbor,
      "line-width": 2,
      "line-opacity": 1,
      "line-dasharray": [2, 4],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Airwallex route (indigo, dashed)
  map.addLayer({
    id: "route-airwallex-casing",
    type: "line",
    source: "cycling-route-airwallex",
    paint: {
      "line-color": COLORS.routeAirwallexCasing,
      "line-width": 2,
      "line-opacity": 0.2,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "route-airwallex-fill",
    type: "line",
    source: "cycling-route-airwallex",
    paint: {
      "line-color": COLORS.routeAirwallex,
      "line-width": 2,
      "line-opacity": 1,
      "line-dasharray": [2, 4],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Watch route changes
  watch(activeRoutes, (routes) => {
    const fhSrc = getGeoJSONSource(map, "cycling-route-fareharbor");
    const awSrc = getGeoJSONSource(map, "cycling-route-airwallex");
    if (!fhSrc || !awSrc) return;

    if (routes?.fareharbor) {
      fhSrc.setData(routeToFeature(routes.fareharbor.geometry));
    } else {
      fhSrc.setData(emptyFC);
    }

    if (routes?.airwallex) {
      awSrc.setData(routeToFeature(routes.airwallex.geometry));
    } else {
      awSrc.setData(emptyFC);
    }

    // Update cycling times in the live popup DOM
    const timesEl = document.querySelector(".funda-cycling-times");
    if (!timesEl) return;

    if (!routes?.fareharbor && !routes?.airwallex) {
      timesEl.innerHTML = "";
      return;
    }

    const parts: string[] = [];
    if (routes?.fareharbor) {
      parts.push(
        `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeFareharbor}"></span><span style="color:${COLORS.routeFareharbor}">${routes.fareharbor.duration} min</span> to ${OFFICES.fareharbor.name}</span>`,
      );
    }
    if (routes?.airwallex) {
      parts.push(
        `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeAirwallex}"></span><span style="color:${COLORS.routeAirwallex}">${routes.airwallex.duration} min</span> to ${OFFICES.airwallex.name}</span>`,
      );
    }
    timesEl.innerHTML = parts.join("");
  });

  watch(routesLoading, (loading) => {
    const timesEl = document.querySelector(".funda-cycling-times");
    if (!timesEl) return;
    if (loading) {
      timesEl.innerHTML = `<span class="funda-cycling-loading"><span></span><span></span></span>`;
    }
  });
}
