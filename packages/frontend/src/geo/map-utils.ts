import type maplibregl from "maplibre-gl";

/**
 * Runtime-safe alternative to `map.getSource(id) as GeoJSONSource`.
 * Returns the source only if it exists and has a `setData` method.
 */
export function getGeoJSONSource(map: maplibregl.Map, id: string): maplibregl.GeoJSONSource | null {
  const src = map.getSource(id);
  if (src && "setData" in src) {
    return src as maplibregl.GeoJSONSource;
  }
  return null;
}
