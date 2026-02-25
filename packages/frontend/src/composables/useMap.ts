import type { Ref } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CENTER, DEFAULT_ZOOM } from "@/geo/constants";
import { loadGreyscaleStyle } from "@/geo/greyscale-style";

export function useMap(container: Ref<HTMLDivElement | undefined>) {
  let map: maplibregl.Map | null = null;

  async function initMap(): Promise<maplibregl.Map> {
    if (!container.value) throw new Error("Map container not available");

    const style = await loadGreyscaleStyle("https://tiles.openfreemap.org/styles/bright");

    map = new maplibregl.Map({
      container: container.value,
      style,
      center: [MAP_CENTER.lon, MAP_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    return map;
  }

  return { map, initMap };
}
