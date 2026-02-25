import { shallowRef } from "vue";
import type maplibregl from "maplibre-gl";

const mapInstance = shallowRef<maplibregl.Map | null>(null);

function setMap(map: maplibregl.Map) {
  mapInstance.value = map;
}

function flyTo(lng: number, lat: number, zoom?: number) {
  const map = mapInstance.value;
  if (!map) return;

  map.flyTo({
    center: [lng, lat],
    zoom: zoom ?? Math.max(map.getZoom(), 16),
    duration: 1200,
  });
}

export { setMap, flyTo };
