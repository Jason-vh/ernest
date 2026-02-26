<template>
  <div class="mt-4 overflow-hidden rounded-xl border border-black/6">
    <div ref="mapContainer" class="h-[200px] w-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import maplibregl from "maplibre-gl";
import { COLORS } from "@/geo/constants";
import { fetchLines, fetchStations } from "@/api/client";
import { StopType } from "@/types/transit";

const props = defineProps<{
  longitude: number;
  latitude: number;
}>();

const mapContainer = ref<HTMLDivElement>();
let map: maplibregl.Map | null = null;
let marker: maplibregl.Marker | null = null;

function createMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z"
          fill="${COLORS.fundaUnreviewed}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="11" r="4" fill="#fff"/>
  </svg>`;
  return el;
}

async function initMiniMap() {
  if (!mapContainer.value) return;

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: "https://tiles.openfreemap.org/styles/bright",
    center: [props.longitude, props.latitude],
    zoom: 14,
    attributionControl: false,
    dragPan: false,
    dragRotate: false,
    touchZoomRotate: true,
    touchPitch: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  marker = new maplibregl.Marker({
    element: createMarkerElement(),
    anchor: "bottom",
  })
    .setLngLat([props.longitude, props.latitude])
    .addTo(map);

  map.on("load", async () => {
    if (!map) return;
    const [lines, stations] = await Promise.all([fetchLines(), fetchStations()]);

    const lineTypes = [
      { type: "tram", color: COLORS.tramLine, width: 1.5 },
      { type: "metro", color: COLORS.metro, width: 2 },
      { type: "train", color: COLORS.train, width: 2 },
    ];

    for (const { type, color, width } of lineTypes) {
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: lines.features.filter((f) => f.properties?.lineType === type),
      };
      map.addSource(`mini-${type}-lines`, { type: "geojson", data });
      map.addLayer({
        id: `mini-${type}-lines`,
        type: "line",
        source: `mini-${type}-lines`,
        paint: { "line-color": color, "line-width": width, "line-opacity": 0.2 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }

    const stopTypes = [
      { stopType: StopType.Tram, color: COLORS.tram, radius: 2 },
      { stopType: StopType.Metro, color: COLORS.metro, radius: 3.5 },
      { stopType: StopType.Train, color: COLORS.train, radius: 3.5 },
    ];

    for (const { stopType, color, radius } of stopTypes) {
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: stations
          .filter((s) => s.type === stopType)
          .map((s) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
            properties: {},
          })),
      };
      map.addSource(`mini-${stopType}-stops`, { type: "geojson", data });
      map.addLayer({
        id: `mini-${stopType}-stops`,
        type: "circle",
        source: `mini-${stopType}-stops`,
        paint: {
          "circle-radius": radius,
          "circle-color": color,
          "circle-opacity": 0.5,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });
    }
  });
}

// When coordinates change (navigating cluster), update map center and marker
watch(
  () => [props.longitude, props.latitude],
  ([lng, lat]) => {
    if (!map || typeof lng !== "number" || typeof lat !== "number") return;
    map.jumpTo({ center: [lng, lat] });
    if (marker) {
      marker.setLngLat([lng, lat]);
    }
  },
);

onMounted(() => {
  initMiniMap();
});

onBeforeUnmount(() => {
  if (marker) {
    marker.remove();
    marker = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
});
</script>
