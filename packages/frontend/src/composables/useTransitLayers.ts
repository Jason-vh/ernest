import type { Ref } from "vue";
import { watch } from "vue";
import maplibregl from "maplibre-gl";
import { COLORS } from "@/geo/constants";
import { StopType, type TransitStop } from "@/types/transit";
import { TRANSIT_KEYS, type TransitKey } from "@/composables/useZoneState";
import { createLabel } from "@/composables/useOfficeMarkers";

const LINE_LAYERS: Record<TransitKey, string[]> = {
  train: ["train-lines-casing", "train-lines-fill"],
  metro: ["metro-lines-casing", "metro-lines-fill"],
  tram: ["tram-lines-fill"],
  ferry: ["ferry-lines-fill"],
};

const STATION_LAYERS: Record<TransitKey, string[]> = {
  train: ["train-circles-outer"],
  metro: ["metro-circles"],
  tram: ["tram-stops"],
  ferry: ["ferry-circles"],
};

export const TRANSIT_LAYERS: Record<TransitKey, string[]> = {
  train: [...LINE_LAYERS.train, ...STATION_LAYERS.train],
  metro: [...LINE_LAYERS.metro, ...STATION_LAYERS.metro],
  tram: [...LINE_LAYERS.tram, ...STATION_LAYERS.tram],
  ferry: [...LINE_LAYERS.ferry, ...STATION_LAYERS.ferry],
};

interface TransitState {
  transitVisibility: Ref<Record<TransitKey, boolean>>;
  hoveredTransit: Ref<TransitKey | null>;
}

function stationsToGeoJSON(stations: TransitStop[], type: StopType): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations
      .filter((s) => s.type === type)
      .map((s) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [s.lon, s.lat],
        },
        properties: {
          id: s.id,
          name: s.name,
          type: s.type,
        },
      })),
  };
}

export function useTransitLayers(
  map: maplibregl.Map,
  stations: TransitStop[],
  lines: GeoJSON.FeatureCollection,
  state: TransitState,
) {
  const { transitVisibility, hoveredTransit } = state;

  // --- Transit lines ---
  const tramLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((f) => f.properties?.lineType === "tram"),
  };
  const trainLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((f) => f.properties?.lineType === "train"),
  };
  const metroLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((f) => f.properties?.lineType === "metro"),
  };
  const ferryLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((f) => f.properties?.lineType === "ferry"),
  };

  // Ferry lines (added first so they render beneath other transit)
  map.addSource("ferry-lines", { type: "geojson", data: ferryLines });
  map.addLayer({
    id: "ferry-lines-fill",
    type: "line",
    source: "ferry-lines",
    paint: {
      "line-color": COLORS.ferry,
      "line-width": 1.5,
      "line-opacity": 0.1,
      "line-dasharray": [4, 3],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Tram lines
  map.addSource("tram-lines", { type: "geojson", data: tramLines });
  map.addLayer({
    id: "tram-lines-fill",
    type: "line",
    source: "tram-lines",
    paint: {
      "line-color": COLORS.tramLine,
      "line-width": 1,
      "line-opacity": 0.1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Train tracks
  map.addSource("train-lines", { type: "geojson", data: trainLines });
  map.addLayer({
    id: "train-lines-casing",
    type: "line",
    source: "train-lines",
    paint: {
      "line-color": COLORS.trainCasing,
      "line-width": 2,
      "line-opacity": 0.1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "train-lines-fill",
    type: "line",
    source: "train-lines",
    paint: {
      "line-color": COLORS.train,
      "line-width": 1,
      "line-opacity": 0.1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Metro lines
  map.addSource("metro-lines", { type: "geojson", data: metroLines });
  map.addLayer({
    id: "metro-lines-casing",
    type: "line",
    source: "metro-lines",
    paint: {
      "line-color": "#fff",
      "line-width": 2,
      "line-opacity": 0.1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "metro-lines-fill",
    type: "line",
    source: "metro-lines",
    paint: {
      "line-color": COLORS.metro,
      "line-width": 1,
      "line-opacity": 0.1,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // --- Ferry stops ---
  const ferryGeoJSON = stationsToGeoJSON(stations, StopType.Ferry);
  map.addSource("ferry-stations", { type: "geojson", data: ferryGeoJSON });
  map.addLayer({
    id: "ferry-circles",
    type: "circle",
    source: "ferry-stations",
    paint: {
      "circle-radius": 4,
      "circle-color": COLORS.ferry,
      "circle-opacity": 0.6,
      "circle-opacity-transition": { duration: 200, delay: 0 },
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-stroke-opacity-transition": { duration: 200, delay: 0 },
    },
  });

  // --- Tram stops (swells on lines) ---
  const tramGeoJSON = stationsToGeoJSON(stations, StopType.Tram);
  map.addSource("tram-stations", { type: "geojson", data: tramGeoJSON });
  map.addLayer({
    id: "tram-stops",
    type: "circle",
    source: "tram-stations",
    paint: {
      "circle-radius": 2,
      "circle-color": COLORS.tram,
      "circle-opacity": 0.5,
      "circle-opacity-transition": { duration: 200, delay: 0 },
    },
  });

  // --- Metro stations ---
  const metroGeoJSON = stationsToGeoJSON(stations, StopType.Metro);
  map.addSource("metro-stations", { type: "geojson", data: metroGeoJSON });
  map.addLayer({
    id: "metro-circles",
    type: "circle",
    source: "metro-stations",
    paint: {
      "circle-radius": 4,
      "circle-color": COLORS.metro,
      "circle-opacity": 0.6,
      "circle-opacity-transition": { duration: 200, delay: 0 },
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-stroke-opacity-transition": { duration: 200, delay: 0 },
    },
  });

  // Station labels (HTML markers)
  const transitMarkers: Record<TransitKey, maplibregl.Marker[]> = {
    train: [],
    metro: [],
    tram: [],
    ferry: [],
  };

  // Ferry stop labels
  for (const feature of ferryGeoJSON.features) {
    const geom = feature.geometry;
    if (geom.type !== "Point") continue;
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const name = feature.properties?.name;
    if (!name) continue;
    const marker = new maplibregl.Marker({
      element: createLabel(name, COLORS.ferry, 0.7),
      anchor: "top",
    })
      .setLngLat([coords[0], coords[1]])
      .addTo(map);
    transitMarkers.ferry.push(marker);
  }

  // Metro station labels
  for (const feature of metroGeoJSON.features) {
    const geom = feature.geometry;
    if (geom.type !== "Point") continue;
    const coords = geom.coordinates as [number, number];
    const name = feature.properties?.name;
    if (!name) continue;
    const marker = new maplibregl.Marker({
      element: createLabel(name, COLORS.metro, 0.7),
      anchor: "top",
    })
      .setLngLat(coords)
      .addTo(map);
    transitMarkers.metro.push(marker);
  }

  // --- Train stations ---
  const trainGeoJSON = stationsToGeoJSON(stations, StopType.Train);
  map.addSource("train-stations", { type: "geojson", data: trainGeoJSON });
  map.addLayer({
    id: "train-circles-outer",
    type: "circle",
    source: "train-stations",
    paint: {
      "circle-radius": 4,
      "circle-color": COLORS.train,
      "circle-opacity": 0.6,
      "circle-opacity-transition": { duration: 200, delay: 0 },
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-stroke-opacity-transition": { duration: 200, delay: 0 },
    },
  });

  // Train station labels (HTML markers)
  for (const feature of trainGeoJSON.features) {
    const geom = feature.geometry;
    if (geom.type !== "Point") continue;
    const coords = geom.coordinates as [number, number];
    const name = feature.properties?.name;
    if (!name) continue;
    const marker = new maplibregl.Marker({
      element: createLabel(name, COLORS.train, 0.7),
      anchor: "top",
    })
      .setLngLat(coords)
      .addTo(map);
    transitMarkers.train.push(marker);
  }

  // --- Transit visibility + hover highlight ---
  const DEFAULT_LINE_OPACITY: Record<TransitKey, number> = {
    train: 0.1,
    metro: 0.1,
    tram: 0.1,
    ferry: 0.1,
  };
  const DEFAULT_CIRCLE_OPACITY: Record<TransitKey, number> = {
    train: 0.6,
    metro: 0.6,
    tram: 0.5,
    ferry: 0.6,
  };
  const DEFAULT_LABEL_OPACITY: Record<TransitKey, number> = {
    train: 0.7,
    metro: 0.7,
    tram: 1,
    ferry: 0.7,
  };

  function updateTransitLayers() {
    const hovered = hoveredTransit.value;
    const someHovered = hovered !== null;

    for (const key of TRANSIT_KEYS) {
      const visible = transitVisibility.value[key];
      const isHovered = hovered === key;

      // Line layers stay visible always, only opacity changes on hover
      for (const layerId of LINE_LAYERS[key]) {
        if (!map.getLayer(layerId)) continue;
        const defaultOp = DEFAULT_LINE_OPACITY[key];
        const op = someHovered ? (isHovered ? 1 : defaultOp * 0.3) : defaultOp;
        map.setPaintProperty(layerId, "line-opacity", op);
      }

      // Station layers — use opacity for animated transitions
      for (const layerId of STATION_LAYERS[key]) {
        if (!map.getLayer(layerId)) continue;
        const defaultOp = DEFAULT_CIRCLE_OPACITY[key];
        const op = visible ? (someHovered ? (isHovered ? 1 : defaultOp * 0.3) : defaultOp) : 0;
        map.setPaintProperty(layerId, "circle-opacity", op);
        map.setPaintProperty(
          layerId,
          "circle-stroke-opacity",
          visible ? (someHovered ? (isHovered ? 1 : 0.3) : 1) : 0,
        );
      }

      // HTML label markers — set opacity on the child span, not the marker
      // wrapper, because MapLibre resets wrapper opacity on every map move
      for (const marker of transitMarkers[key]) {
        const el = marker.getElement();
        const label = el.firstElementChild as HTMLElement;
        if (!label) continue;
        label.style.transition = "opacity 200ms";
        if (visible) {
          const defaultOp = DEFAULT_LABEL_OPACITY[key];
          label.style.opacity = String(someHovered ? (isHovered ? 1 : defaultOp * 0.3) : defaultOp);
          el.style.pointerEvents = "";
        } else {
          label.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
      }
    }
  }

  updateTransitLayers();
  watch([transitVisibility, hoveredTransit], updateTransitLayers, {
    deep: true,
  });
}
