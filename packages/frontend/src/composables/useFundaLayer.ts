import type { Ref } from "vue";
import { watch } from "vue";
import type maplibregl from "maplibre-gl";

interface FundaState {
  clickedFundaUrls: Ref<Set<string>>;
  fundaCount: Ref<number>;
  fundaNewVisible: Ref<boolean>;
  fundaViewedVisible: Ref<boolean>;
}

const emptyFC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function useFundaLayer(
  map: maplibregl.Map,
  funda: GeoJSON.FeatureCollection,
  state: FundaState,
) {
  const { clickedFundaUrls, fundaCount, fundaNewVisible, fundaViewedVisible } = state;

  function stampClickedState(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
    const clicked = clickedFundaUrls.value;
    return {
      ...fc,
      features: fc.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          clicked: clicked.has(f.properties?.url ?? ""),
        },
      })),
    };
  }

  const fundaStamped = stampClickedState(funda);
  fundaCount.value = funda.features.length;
  map.addSource("funda", { type: "geojson", data: fundaStamped });

  // --- Funda building highlights (below dots) ---
  map.addSource("funda-buildings", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "funda-building-fill",
    type: "fill",
    source: "funda-buildings",
    paint: {
      "fill-color": ["case", ["==", ["get", "clicked"], true], "#aaa", "#E8950F"],
      "fill-opacity": ["case", ["==", ["get", "clicked"], true], 0.25, 0.4],
    },
  });
  map.addLayer({
    id: "funda-building-outline",
    type: "line",
    source: "funda-buildings",
    paint: {
      "line-color": ["case", ["==", ["get", "clicked"], true], "#aaa", "#E8950F"],
      "line-opacity": ["case", ["==", ["get", "clicked"], true], 0.4, 0.7],
      "line-width": 1.5,
    },
  });

  // Funda dots (above building highlights)
  map.addLayer({
    id: "funda-circles",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": 5,
      "circle-color": ["case", ["==", ["get", "clicked"], true], "#aaa", "#E8950F"],
      "circle-opacity": 1,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  });

  // --- Funda visibility (new + viewed as independent toggles) ---
  const FUNDA_LAYERS = ["funda-circles", "funda-building-fill", "funda-building-outline"];

  function updateFundaLayer() {
    if (!map.getLayer("funda-circles")) return;
    const showNew = fundaNewVisible.value;
    const showViewed = fundaViewedVisible.value;

    if (!showNew && !showViewed) {
      for (const id of FUNDA_LAYERS) {
        map.setLayoutProperty(id, "visibility", "none");
      }
    } else {
      for (const id of FUNDA_LAYERS) {
        map.setLayoutProperty(id, "visibility", "visible");
      }
      let filter: maplibregl.FilterSpecification | null = null;
      if (showNew && !showViewed) {
        filter = ["!=", ["get", "clicked"], true];
      } else if (!showNew && showViewed) {
        filter = ["==", ["get", "clicked"], true];
      }
      for (const id of FUNDA_LAYERS) {
        map.setFilter(id, filter);
      }
    }
  }

  updateFundaLayer();
  watch([fundaNewVisible, fundaViewedVisible], updateFundaLayer);

  return { stampClickedState };
}
