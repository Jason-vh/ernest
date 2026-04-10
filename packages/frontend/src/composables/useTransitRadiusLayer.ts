import maplibregl from "maplibre-gl";
import { AMSTERDAM_CENTRAAL, COLORS, TRANSIT_RADIUS_KM } from "@/geo/constants";

const EARTH_RADIUS_KM = 6371;
const CIRCLE_STEPS = 180;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function destinationPoint(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDegrees: number,
): [number, number] {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDegrees);
  const startLat = toRadians(lat);
  const startLon = toRadians(lon);

  const endLat = Math.asin(
    Math.sin(startLat) * Math.cos(angularDistance) +
      Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const endLon =
    startLon +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
      Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(endLat),
    );

  return [toDegrees(endLon), toDegrees(endLat)];
}

function createTransitRadiusGeoJSON(): GeoJSON.FeatureCollection {
  const coordinates: [number, number][] = [];

  for (let step = 0; step <= CIRCLE_STEPS; step++) {
    const bearing = (step / CIRCLE_STEPS) * 360;
    coordinates.push(
      destinationPoint(AMSTERDAM_CENTRAAL.lat, AMSTERDAM_CENTRAAL.lon, TRANSIT_RADIUS_KM, bearing),
    );
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
        properties: {
          name: `${TRANSIT_RADIUS_KM} km from Amsterdam Centraal`,
        },
      },
    ],
  };
}

export function useTransitRadiusLayer(map: maplibregl.Map) {
  const radiusGeoJSON = createTransitRadiusGeoJSON();

  map.addSource("transit-radius", {
    type: "geojson",
    data: radiusGeoJSON,
  });

  map.addLayer({
    id: "transit-radius-line",
    type: "line",
    source: "transit-radius",
    paint: {
      "line-color": COLORS.fundaDiscarded,
      "line-width": 2,
      "line-opacity": 0.45,
      "line-dasharray": [2, 2],
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });
}
