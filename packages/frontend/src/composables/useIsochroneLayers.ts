import type { Ref } from "vue";
import { watch } from "vue";
import type maplibregl from "maplibre-gl";
import { COLORS } from "@/geo/constants";
import { ZONE_KEYS, type ZoneKey } from "@/composables/useZoneState";

interface ZoneState {
  zoneVisibility: Ref<Record<ZoneKey, boolean>>;
  hoveredZone: Ref<ZoneKey | null>;
}

export function useIsochroneLayers(
  map: maplibregl.Map,
  isochrone: GeoJSON.FeatureCollection,
  state: ZoneState,
) {
  const { zoneVisibility, hoveredZone } = state;

  map.addSource("zones", { type: "geojson", data: isochrone });

  // Insert zones before the first water layer so order is: buildings -> zones -> water
  const waterLayerId = map.getStyle().layers.find((l) => l.id === "water")?.id ?? undefined;

  // 30-min zone (red, outermost)
  map.addLayer(
    {
      id: "zone-30-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "30min"],
      paint: {
        "line-color": COLORS.zone30,
        "line-width": 2,
        "line-opacity": 0.5,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // 20-min zone (orange)
  map.addLayer(
    {
      id: "zone-20-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "20min"],
      paint: {
        "line-color": COLORS.zone20,
        "line-width": 1.5,
        "line-opacity": 0.5,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // 10-min zone (green, innermost)
  map.addLayer(
    {
      id: "zone-10-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "10min"],
      paint: {
        "line-color": COLORS.zone10,
        "line-width": 1.5,
        "line-opacity": 0.5,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // Zone visibility / hover emphasis
  function updateZoneLayers() {
    for (const key of ZONE_KEYS) {
      const borderId = `zone-${key}-border`;
      if (!map.getLayer(borderId)) continue;

      const visible = zoneVisibility.value[key];
      map.setLayoutProperty(borderId, "visibility", visible ? "visible" : "none");

      if (visible) {
        const someHovered = hoveredZone.value !== null;
        const isHovered = hoveredZone.value === key;
        let borderOpacity = 0.5;

        if (someHovered) {
          borderOpacity = isHovered ? 0.9 : 0.2;
        }

        map.setPaintProperty(borderId, "line-opacity", borderOpacity);
      }
    }
  }

  updateZoneLayers();
  watch([zoneVisibility, hoveredZone], updateZoneLayers, { deep: true });
}
