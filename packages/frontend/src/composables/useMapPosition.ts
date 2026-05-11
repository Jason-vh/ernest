import { shallowRef } from "vue";
import type maplibregl from "maplibre-gl";

const mapInstance = shallowRef<maplibregl.Map | null>(null);
let queuedFlyTo: { lng: number; lat: number; zoom?: number } | null = null;

function doFly(map: maplibregl.Map, lng: number, lat: number, zoom?: number) {
  map.flyTo({
    center: [lng, lat],
    zoom: zoom ?? Math.max(map.getZoom(), 16),
    duration: 1200,
  });
}

function setMap(map: maplibregl.Map | null) {
  mapInstance.value = map;
  if (map && queuedFlyTo) {
    const target = queuedFlyTo;
    queuedFlyTo = null;
    if (map.loaded()) {
      doFly(map, target.lng, target.lat, target.zoom);
    } else {
      map.once("load", () => doFly(map, target.lng, target.lat, target.zoom));
    }
  }
}

function flyTo(lng: number, lat: number, zoom?: number) {
  const map = mapInstance.value;
  if (!map) {
    queuedFlyTo = { lng, lat, zoom };
    return;
  }
  doFly(map, lng, lat, zoom);
}

export { setMap, flyTo };
