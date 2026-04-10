import type { Ref } from "vue";
import { watch } from "vue";
import maplibregl from "maplibre-gl";
import { COLORS } from "@/geo/constants";
import { StopType, type TransitStop } from "@/types/transit";
import { TRANSIT_KEYS, type TransitKey } from "@/composables/useZoneState";

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

const LABEL_LAYERS: Record<TransitKey, string[]> = {
  train: ["train-labels"],
  metro: ["metro-labels"],
  tram: [],
  ferry: ["ferry-labels"],
};

export const TRANSIT_LAYERS: Record<TransitKey, string[]> = {
  train: [...LINE_LAYERS.train, ...STATION_LAYERS.train, ...LABEL_LAYERS.train],
  metro: [...LINE_LAYERS.metro, ...STATION_LAYERS.metro, ...LABEL_LAYERS.metro],
  tram: [...LINE_LAYERS.tram, ...STATION_LAYERS.tram, ...LABEL_LAYERS.tram],
  ferry: [...LINE_LAYERS.ferry, ...STATION_LAYERS.ferry, ...LABEL_LAYERS.ferry],
};

interface TransitState {
  transitVisibility: Ref<Record<TransitKey, boolean>>;
  hoveredTransit: Ref<TransitKey | null>;
}

interface LabelLayerOptions {
  id: string;
  source: string;
  color: string;
  minzoom: number;
  textSize: number;
}

function stationsToGeoJSON(stations: TransitStop[], type: StopType): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations
      .filter((station) => station.type === type)
      .map((station) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [station.lon, station.lat],
        },
        properties: {
          id: station.id,
          name: station.name,
          type: station.type,
        },
      })),
  };
}

function addLabelLayer(map: maplibregl.Map, options: LabelLayerOptions) {
  map.addLayer({
    id: options.id,
    type: "symbol",
    source: options.source,
    minzoom: options.minzoom,
    layout: {
      "text-field": ["get", "name"],
      "text-size": options.textSize,
      "text-anchor": "top",
      "text-offset": [0, 0.9],
      "text-letter-spacing": 0.01,
      "text-max-width": 14,
    },
    paint: {
      "text-color": options.color,
      "text-opacity": 0.7,
      "text-opacity-transition": { duration: 200, delay: 0 },
      "text-halo-color": "rgba(255, 255, 255, 0.95)",
      "text-halo-width": 1.25,
      "text-halo-blur": 0.5,
    },
  });
}

export function useTransitLayers(
  map: maplibregl.Map,
  stations: TransitStop[],
  lines: GeoJSON.FeatureCollection,
  state: TransitState,
) {
  const { transitVisibility, hoveredTransit } = state;

  const tramLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((feature) => feature.properties?.lineType === "tram"),
  };
  const trainLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((feature) => feature.properties?.lineType === "train"),
  };
  const metroLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((feature) => feature.properties?.lineType === "metro"),
  };
  const ferryLines: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lines.features.filter((feature) => feature.properties?.lineType === "ferry"),
  };

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
  addLabelLayer(map, {
    id: "ferry-labels",
    source: "ferry-stations",
    color: COLORS.ferry,
    minzoom: 11,
    textSize: 11,
  });

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
  addLabelLayer(map, {
    id: "metro-labels",
    source: "metro-stations",
    color: COLORS.metro,
    minzoom: 11,
    textSize: 11,
  });

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
  addLabelLayer(map, {
    id: "train-labels",
    source: "train-stations",
    color: COLORS.train,
    minzoom: 10,
    textSize: 11,
  });

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
    tram: 0,
    ferry: 0.7,
  };

  function updateTransitLayers() {
    const hovered = hoveredTransit.value;
    const someHovered = hovered !== null;

    for (const key of TRANSIT_KEYS) {
      const visible = transitVisibility.value[key];
      const isHovered = hovered === key;

      for (const layerId of LINE_LAYERS[key]) {
        if (!map.getLayer(layerId)) continue;
        const defaultOpacity = DEFAULT_LINE_OPACITY[key];
        const opacity = someHovered ? (isHovered ? 1 : defaultOpacity * 0.3) : defaultOpacity;
        map.setPaintProperty(layerId, "line-opacity", opacity);
      }

      for (const layerId of STATION_LAYERS[key]) {
        if (!map.getLayer(layerId)) continue;
        const defaultOpacity = DEFAULT_CIRCLE_OPACITY[key];
        const opacity = visible
          ? someHovered
            ? isHovered
              ? 1
              : defaultOpacity * 0.3
            : defaultOpacity
          : 0;
        map.setPaintProperty(layerId, "circle-opacity", opacity);
        map.setPaintProperty(
          layerId,
          "circle-stroke-opacity",
          visible ? (someHovered ? (isHovered ? 1 : 0.3) : 1) : 0,
        );
      }

      for (const layerId of LABEL_LAYERS[key]) {
        if (!map.getLayer(layerId)) continue;
        const defaultOpacity = DEFAULT_LABEL_OPACITY[key];
        const opacity = visible
          ? someHovered
            ? isHovered
              ? 1
              : defaultOpacity * 0.3
            : defaultOpacity
          : 0;
        map.setPaintProperty(layerId, "text-opacity", opacity);
      }
    }
  }

  updateTransitLayers();
  watch([transitVisibility, hoveredTransit], updateTransitLayers, {
    deep: true,
  });
}
