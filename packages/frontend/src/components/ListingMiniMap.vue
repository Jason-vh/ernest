<template>
  <div class="mt-4 overflow-hidden rounded-xl border border-black/6">
    <div ref="mapContainer" class="h-[200px] w-full"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import maplibregl from "maplibre-gl";
import { loadGreyscaleStyle } from "@/geo/greyscale-style";
import { COLORS } from "@/geo/constants";

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

  const style = await loadGreyscaleStyle("https://tiles.openfreemap.org/styles/bright");

  map = new maplibregl.Map({
    container: mapContainer.value,
    style,
    center: [props.longitude, props.latitude],
    zoom: 13,
    attributionControl: false,
    interactive: false,
  });

  marker = new maplibregl.Marker({
    element: createMarkerElement(),
    anchor: "bottom",
  })
    .setLngLat([props.longitude, props.latitude])
    .addTo(map);
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
