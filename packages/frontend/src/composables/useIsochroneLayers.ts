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
      id: "zone-30-fill",
      type: "fill",
      source: "zones",
      filter: ["==", ["get", "zone"], "30min"],
      paint: { "fill-color": COLORS.zone30, "fill-opacity": 0.08 },
    },
    waterLayerId,
  );
  map.addLayer(
    {
      id: "zone-30-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "30min"],
      paint: {
        "line-color": COLORS.zone30,
        "line-width": 2,
        "line-opacity": 0.4,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // 20-min zone (orange)
  map.addLayer(
    {
      id: "zone-20-fill",
      type: "fill",
      source: "zones",
      filter: ["==", ["get", "zone"], "20min"],
      paint: { "fill-color": COLORS.zone20, "fill-opacity": 0.1 },
    },
    waterLayerId,
  );
  map.addLayer(
    {
      id: "zone-20-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "20min"],
      paint: {
        "line-color": COLORS.zone20,
        "line-width": 1.5,
        "line-opacity": 0.4,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // 10-min zone (green, innermost)
  map.addLayer(
    {
      id: "zone-10-fill",
      type: "fill",
      source: "zones",
      filter: ["==", ["get", "zone"], "10min"],
      paint: { "fill-color": COLORS.zone10, "fill-opacity": 0.12 },
    },
    waterLayerId,
  );
  map.addLayer(
    {
      id: "zone-10-border",
      type: "line",
      source: "zones",
      filter: ["==", ["get", "zone"], "10min"],
      paint: {
        "line-color": COLORS.zone10,
        "line-width": 1.5,
        "line-opacity": 0.4,
        "line-dasharray": [4, 3],
      },
    },
    waterLayerId,
  );

  // Zone visibility / hover emphasis
  const defaultFillOpacity: Record<string, number> = {
    "10": 0.12,
    "20": 0.1,
    "30": 0.08,
  };

  function updateZoneLayers() {
    for (const key of ZONE_KEYS) {
      const fillId = `zone-${key}-fill`;
      const borderId = `zone-${key}-border`;
      if (!map.getLayer(fillId)) continue;

      const visible = zoneVisibility.value[key];
      map.setLayoutProperty(fillId, "visibility", visible ? "visible" : "none");
      map.setLayoutProperty(borderId, "visibility", visible ? "visible" : "none");

      if (visible) {
        const someHovered = hoveredZone.value !== null;
        const isHovered = hoveredZone.value === key;
        let fillOpacity = defaultFillOpacity[key];
        let borderOpacity = 0.4;

        if (someHovered) {
          if (isHovered) {
            fillOpacity = 0.3;
            borderOpacity = 0.8;
          } else {
            fillOpacity = 0.03;
            borderOpacity = 0.15;
          }
        }

        map.setPaintProperty(fillId, "fill-opacity", fillOpacity);
        map.setPaintProperty(borderId, "line-opacity", borderOpacity);
      }
    }
  }

  updateZoneLayers();
  watch([zoneVisibility, hoveredZone], updateZoneLayers, { deep: true });
}
