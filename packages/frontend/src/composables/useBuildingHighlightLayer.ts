import type { Ref } from "vue";
import type maplibregl from "maplibre-gl";
import { getGeoJSONSource } from "@/geo/map-utils";
import { matchBuildingsToFunda } from "@/composables/useBuildingHighlights";

const emptyData: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function useBuildingHighlightLayer(map: maplibregl.Map, viewedFundaIds: Ref<Set<string>>) {
  let lastBuildingViewKey = "";
  let buildingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function updateBuildingHighlights() {
    const src = getGeoJSONSource(map, "funda-buildings");
    if (!src) return;

    if (map.getZoom() < 15) {
      if (lastBuildingViewKey !== "empty") {
        lastBuildingViewKey = "empty";
        src.setData(emptyData);
        map.setPaintProperty("funda-circles", "circle-radius", 5);
        map.setPaintProperty("funda-circles", "circle-stroke-width", 1);
      }
      return;
    }

    // Wait for vector tiles to finish loading
    if (!map.isSourceLoaded("openmaptiles")) return;

    // Skip if viewport hasn't meaningfully changed
    const b = map.getBounds();
    const viewKey = `${map.getZoom().toFixed(1)}:${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`;
    if (viewKey === lastBuildingViewKey) return;
    lastBuildingViewKey = viewKey;

    // Get visible funda features (respecting current filters)
    const visibleFeatures = map.queryRenderedFeatures(undefined, {
      layers: ["funda-circles"],
    });
    if (visibleFeatures.length === 0) {
      src.setData(emptyData);
      return;
    }

    // Deduplicate by fundaId (queryRenderedFeatures can return duplicates across tiles)
    const seen = new Set<string>();
    const unique: GeoJSON.Feature[] = [];
    for (const f of visibleFeatures) {
      const fundaId = f.properties?.fundaId;
      if (fundaId && !seen.has(fundaId)) {
        seen.add(fundaId);
        unique.push(f);
      }
    }

    const { buildings } = matchBuildingsToFunda(map, unique, viewedFundaIds.value);
    src.setData(buildings);
    // Hide dots when building highlights are active (same frame, no flash)
    const hideDots = buildings.features.length > 0;
    map.setPaintProperty("funda-circles", "circle-radius", hideDots ? 0 : 5);
    map.setPaintProperty("funda-circles", "circle-stroke-width", hideDots ? 0 : 1);
  }

  function resetBuildingViewKey() {
    lastBuildingViewKey = "";
  }

  let lastBuildingUpdateTime = 0;
  const THROTTLE_MS = 80;

  function throttledBuildingUpdate() {
    const now = Date.now();
    if (now - lastBuildingUpdateTime >= THROTTLE_MS) {
      lastBuildingUpdateTime = now;
      updateBuildingHighlights();
    } else {
      if (buildingDebounceTimer) clearTimeout(buildingDebounceTimer);
      buildingDebounceTimer = setTimeout(() => {
        lastBuildingUpdateTime = Date.now();
        updateBuildingHighlights();
      }, THROTTLE_MS);
    }
  }

  map.on("move", throttledBuildingUpdate);
  map.once("idle", updateBuildingHighlights);

  // When new vector tiles load (e.g. after a fast zoom), re-query buildings
  map.on("sourcedata", (e) => {
    if (e.sourceId === "openmaptiles" && map.getZoom() >= 15) {
      lastBuildingViewKey = "";
      throttledBuildingUpdate();
    }
  });

  return { updateBuildingHighlights, resetBuildingViewKey };
}
