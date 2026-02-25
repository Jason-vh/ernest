import type maplibregl from "maplibre-gl";

interface MatchResult {
  buildings: GeoJSON.FeatureCollection;
  matchedUrls: Set<string>;
}

/**
 * For each Funda feature, project its coordinates to screen pixels and
 * query the map's rendered building layer to find the underlying polygon.
 *
 * Vector tiles at z13-14 often merge buildings into MultiPolygon features,
 * so we decompose them and use point-in-polygon to find the specific
 * individual building ring that contains the listing's coordinates.
 */
export function matchBuildingsToFunda(
  map: maplibregl.Map,
  fundaFeatures: GeoJSON.Feature[],
  viewedIds: Set<string>,
): MatchResult {
  const matched: GeoJSON.Feature[] = [];
  const matchedUrls = new Set<string>();
  const seenGeomKeys = new Set<string>();

  for (const feature of fundaFeatures) {
    const geom = feature.geometry as GeoJSON.Point;
    if (!geom || geom.type !== "Point") continue;

    const [lng, lat] = geom.coordinates;
    const pixel = map.project([lng, lat]);

    // Query a small bounding box around the point on the "building" layer
    // (not "building-top" which has a translate offset)
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [pixel.x - 3, pixel.y - 3],
      [pixel.x + 3, pixel.y + 3],
    ];

    const buildings = map.queryRenderedFeatures(bbox, { layers: ["building"] });
    if (buildings.length === 0) continue;

    // Find the individual polygon that actually contains this point.
    // Building features can be MultiPolygons (merged blocks in vector tiles).
    let containingPoly: GeoJSON.Polygon | null = null;
    for (const b of buildings) {
      containingPoly = findContainingPolygon([lng, lat], b.geometry);
      if (containingPoly) break;
    }
    if (!containingPoly) continue;

    // Deduplicate by geometry (same building matched by multiple listings)
    const geomKey = JSON.stringify(containingPoly.coordinates);
    const fundaId = feature.properties?.fundaId ?? "";
    const isClicked = viewedIds.has(fundaId);

    if (!seenGeomKeys.has(geomKey)) {
      seenGeomKeys.add(geomKey);
      matched.push({
        type: "Feature",
        geometry: containingPoly,
        properties: {
          ...feature.properties,
          clicked: isClicked,
        },
      });
    }

    matchedUrls.add(fundaId);
  }

  return {
    buildings: { type: "FeatureCollection", features: matched },
    matchedUrls,
  };
}

/** Ray casting point-in-polygon test for a single ring */
function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Extract the individual Polygon from a geometry that contains the given point.
 * Handles both Polygon and MultiPolygon (which vector tiles often use for
 * merged building blocks).
 */
function findContainingPolygon(
  point: [number, number],
  geometry: GeoJSON.Geometry,
): GeoJSON.Polygon | null {
  if (geometry.type === "Polygon") {
    if (pointInRing(point, geometry.coordinates[0] as number[][])) {
      return geometry;
    }
    return null;
  }
  if (geometry.type === "MultiPolygon") {
    for (const polygonCoords of geometry.coordinates) {
      if (pointInRing(point, polygonCoords[0] as number[][])) {
        return { type: "Polygon", coordinates: polygonCoords };
      }
    }
    return null;
  }
  return null;
}
