import type { Ref } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CENTER, DEFAULT_ZOOM } from "@/geo/constants";
import { loadGreyscaleStyle } from "@/geo/greyscale-style";

const POSITION_STORAGE_KEY = "ernest:mapPosition";

interface SavedPosition {
  lon: number;
  lat: number;
  zoom: number;
}

function readSavedPosition(): SavedPosition | null {
  const raw = localStorage.getItem(POSITION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    if (
      typeof parsed.lon !== "number" ||
      typeof parsed.lat !== "number" ||
      typeof parsed.zoom !== "number" ||
      Number.isNaN(parsed.lon) ||
      Number.isNaN(parsed.lat) ||
      Number.isNaN(parsed.zoom) ||
      parsed.lat < -90 ||
      parsed.lat > 90 ||
      parsed.lon < -180 ||
      parsed.lon > 180 ||
      parsed.zoom < 0 ||
      parsed.zoom > 22
    ) {
      return null;
    }
    return { lon: parsed.lon, lat: parsed.lat, zoom: parsed.zoom };
  } catch {
    return null;
  }
}

function savePosition(map: maplibregl.Map): void {
  const center = map.getCenter();
  const zoom = map.getZoom();
  localStorage.setItem(
    POSITION_STORAGE_KEY,
    JSON.stringify({ lon: center.lng, lat: center.lat, zoom }),
  );
}

export function useMap(container: Ref<HTMLDivElement | undefined>) {
  let map: maplibregl.Map | null = null;

  async function initMap(): Promise<maplibregl.Map> {
    if (!container.value) throw new Error("Map container not available");

    const style = await loadGreyscaleStyle("https://tiles.openfreemap.org/styles/bright");
    const saved = readSavedPosition();

    map = new maplibregl.Map({
      container: container.value,
      style,
      center: saved ? [saved.lon, saved.lat] : [MAP_CENTER.lon, MAP_CENTER.lat],
      zoom: saved ? saved.zoom : DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.on("moveend", () => {
      if (map) savePosition(map);
    });

    return map;
  }

  return { map, initMap };
}
