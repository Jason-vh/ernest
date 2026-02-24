<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OFFICES, MAP_CENTER, DEFAULT_ZOOM } from "../geo/constants";
import { loadGreyscaleStyle } from "../geo/greyscale-style";
import {
  fetchIsochrone,
  fetchStations,
  fetchLines,
  fetchFunda,
} from "../api/client";
import { StopType, type TransitStop } from "../types/transit";
import {
  useZoneState,
  ZONE_KEYS,
  TRANSIT_KEYS,
  type TransitKey,
} from "../composables/useZoneState";
import { matchBuildingsToFunda } from "../composables/useBuildingHighlights";
import { useCyclingRoutes } from "../composables/useCyclingRoutes";

const {
  zoneVisibility,
  transitVisibility,
  fundaNewVisible,
  fundaViewedVisible,
  hoveredZone,
  hoveredTransit,
  clickedFundaUrls,
  fundaCount,
  markFundaClicked,
} = useZoneState();

const { activeRoutes, routesLoading, showRoutesForListing, clearRoutes } =
  useCyclingRoutes();

const TRANSIT_LAYERS: Record<TransitKey, string[]> = {
  train: [
    "train-lines-casing",
    "train-lines-fill",
    "train-circles-outer",
    "train-circles-inner",
  ],
  metro: ["metro-lines-casing", "metro-lines-fill", "metro-circles"],
  tram: ["tram-lines-fill", "tram-stops"],
};

const mapContainer = ref<HTMLDivElement>();

const COLORS = {
  train: "#003DA5",
  trainCasing: "#002A73",
  metro: "#E4003A",
  metroCasing: "#B8002E",
  tram: "#7B2D8E",
  tramLine: "#7B2D8E",
  zone10: "#22c55e",
  zone20: "#f59e0b",
  zone30: "#ef4444",
  routeFareharbor: "#14b8a6",
  routeFareharborCasing: "#0d7377",
  routeAirwallex: "#818cf8",
  routeAirwallexCasing: "#4338ca",
};

function stationsToGeoJSON(
  stations: TransitStop[],
  type: StopType,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations
      .filter((s) => s.type === type)
      .map((s) => ({
        type: "Feature",
        geometry: {
          type: "Point",
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

function createOfficeDot(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#222" stroke="#fff" stroke-width="1"/></svg>`;
  return el;
}

function createLabel(
  name: string,
  color: string,
  opacity: number,
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.style.opacity = String(opacity);
  el.innerHTML = `<span style="font-family:'Architects Daughter',cursive;font-size:13px;color:${color};white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 6px #fff">${name}</span>`;
  return el;
}

onMounted(async () => {
  if (!mapContainer.value) return;

  const style = await loadGreyscaleStyle(
    "https://tiles.openfreemap.org/styles/bright",
  );

  const map = new maplibregl.Map({
    container: mapContainer.value,
    style,
    center: [MAP_CENTER.lon, MAP_CENTER.lat],
    zoom: DEFAULT_ZOOM,
    attributionControl: false,
  });

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "top-right",
  );

  // Office markers: dot (non-colliding) + label (collides with other labels)
  const officeLabels: maplibregl.Marker[] = [];
  for (const office of Object.values(OFFICES)) {
    new maplibregl.Marker({ element: createOfficeDot() })
      .setLngLat([office.lon, office.lat])
      .addTo(map);
    const label = new maplibregl.Marker({
      element: createLabel(office.name, "#222", 1),
      anchor: "top",
      offset: [0, 4],
    })
      .setLngLat([office.lon, office.lat])
      .addTo(map);
    officeLabels.push(label);
  }

  map.on("load", async () => {
    const [isochrone, stations, lines, funda] = await Promise.all([
      fetchIsochrone(),
      fetchStations(),
      fetchLines(),
      fetchFunda(),
    ]);

    // --- Cycling zones (above buildings, below water) ---
    map.addSource("zones", { type: "geojson", data: isochrone });

    // Water layers have been reordered above building-top in the style.
    // Insert zones before the first water layer so order is: buildings → zones → water
    const waterLayerId =
      map.getStyle().layers.find((l) => l.id === "water")?.id ?? undefined;

    // 30-min zone (red, outermost)
    map.addLayer(
      {
        id: "zone-30-fill",
        type: "fill",
        source: "zones",
        filter: ["==", ["get", "zone"], "30min"],
        paint: { "fill-color": COLORS.zone30, "fill-opacity": 0.08 },
      },
      waterLayerId,
    );
    map.addLayer(
      {
        id: "zone-30-border",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "zone"], "30min"],
        paint: {
          "line-color": COLORS.zone30,
          "line-width": 2,
          "line-opacity": 0.4,
          "line-dasharray": [4, 3],
        },
      },
      waterLayerId,
    );

    // 20-min zone (orange)
    map.addLayer(
      {
        id: "zone-20-fill",
        type: "fill",
        source: "zones",
        filter: ["==", ["get", "zone"], "20min"],
        paint: { "fill-color": COLORS.zone20, "fill-opacity": 0.1 },
      },
      waterLayerId,
    );
    map.addLayer(
      {
        id: "zone-20-border",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "zone"], "20min"],
        paint: {
          "line-color": COLORS.zone20,
          "line-width": 1.5,
          "line-opacity": 0.4,
          "line-dasharray": [4, 3],
        },
      },
      waterLayerId,
    );

    // 10-min zone (green, innermost)
    map.addLayer(
      {
        id: "zone-10-fill",
        type: "fill",
        source: "zones",
        filter: ["==", ["get", "zone"], "10min"],
        paint: { "fill-color": COLORS.zone10, "fill-opacity": 0.12 },
      },
      waterLayerId,
    );
    map.addLayer(
      {
        id: "zone-10-border",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "zone"], "10min"],
        paint: {
          "line-color": COLORS.zone10,
          "line-width": 1.5,
          "line-opacity": 0.4,
          "line-dasharray": [4, 3],
        },
      },
      waterLayerId,
    );

    // --- Transit lines ---
    const tramLines: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: lines.features.filter((f) => f.properties?.lineType === "tram"),
    };
    const trainLines: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: lines.features.filter(
        (f) => f.properties?.lineType === "train",
      ),
    };
    const metroLines: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: lines.features.filter(
        (f) => f.properties?.lineType === "metro",
      ),
    };

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
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    });
    // Metro station labels (HTML markers for Caveat font)
    const transitMarkers: Record<TransitKey, maplibregl.Marker[]> = {
      train: [],
      metro: [],
      tram: [],
    };
    for (const feature of metroGeoJSON.features) {
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
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
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    });
    // Train station labels (HTML markers for Caveat font)
    for (const feature of trainGeoJSON.features) {
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ];
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

    // --- Funda listings (above everything) ---
    // Stamp clicked state onto features from localStorage
    function stampClickedState(
      fc: GeoJSON.FeatureCollection,
    ): GeoJSON.FeatureCollection {
      const clicked = clickedFundaUrls.value;
      return {
        ...fc,
        features: fc.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            clicked: clicked.has(f.properties?.url ?? ""),
          },
        })),
      };
    }

    const fundaStamped = stampClickedState(funda);
    fundaCount.value = funda.features.length;
    map.addSource("funda", { type: "geojson", data: fundaStamped });

    // --- Cycling route layers (above transit, below funda) ---
    const emptyFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    map.addSource("cycling-route-fareharbor", {
      type: "geojson",
      data: emptyFC,
    });
    map.addSource("cycling-route-airwallex", {
      type: "geojson",
      data: emptyFC,
    });

    // FareHarbor route (teal, dashed)
    map.addLayer({
      id: "route-fareharbor-casing",
      type: "line",
      source: "cycling-route-fareharbor",
      paint: {
        "line-color": COLORS.routeFareharborCasing,
        "line-width": 2,
        "line-opacity": 0.2,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "route-fareharbor-fill",
      type: "line",
      source: "cycling-route-fareharbor",
      paint: {
        "line-color": COLORS.routeFareharbor,
        "line-width": 2,
        "line-opacity": 1,
        "line-dasharray": [2, 4],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });

    // Airwallex route (indigo, dashed)
    map.addLayer({
      id: "route-airwallex-casing",
      type: "line",
      source: "cycling-route-airwallex",
      paint: {
        "line-color": COLORS.routeAirwallexCasing,
        "line-width": 2,
        "line-opacity": 0.2,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "route-airwallex-fill",
      type: "line",
      source: "cycling-route-airwallex",
      paint: {
        "line-color": COLORS.routeAirwallex,
        "line-width": 2,
        "line-opacity": 1,
        "line-dasharray": [2, 4],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });

    // --- Funda building highlights (below dots) ---
    map.addSource("funda-buildings", { type: "geojson", data: emptyFC });
    map.addLayer({
      id: "funda-building-fill",
      type: "fill",
      source: "funda-buildings",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "clicked"], true],
          "#aaa",
          "#E8950F",
        ],
        "fill-opacity": ["case", ["==", ["get", "clicked"], true], 0.25, 0.4],
      },
    });
    map.addLayer({
      id: "funda-building-outline",
      type: "line",
      source: "funda-buildings",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "clicked"], true],
          "#aaa",
          "#E8950F",
        ],
        "line-opacity": ["case", ["==", ["get", "clicked"], true], 0.4, 0.7],
        "line-width": 1.5,
      },
    });

    // Funda dots (above building highlights)
    map.addLayer({
      id: "funda-circles",
      type: "circle",
      source: "funda",
      paint: {
        "circle-radius": 5,
        "circle-color": [
          "case",
          ["==", ["get", "clicked"], true],
          "#aaa",
          "#E8950F",
        ],
        "circle-opacity": 1,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    });

    // --- Zone visibility / hover emphasis ---
    const defaultFillOpacity: Record<string, number> = {
      "10": 0.12,
      "20": 0.1,
      "30": 0.08,
    };

    function updateZoneLayers() {
      for (const key of ZONE_KEYS) {
        const fillId = `zone-${key}-fill`;
        const borderId = `zone-${key}-border`;
        if (!map.getLayer(fillId)) continue;

        const visible = zoneVisibility.value[key];
        map.setLayoutProperty(
          fillId,
          "visibility",
          visible ? "visible" : "none",
        );
        map.setLayoutProperty(
          borderId,
          "visibility",
          visible ? "visible" : "none",
        );

        if (visible) {
          const someHovered = hoveredZone.value !== null;
          const isHovered = hoveredZone.value === key;
          let fillOpacity = defaultFillOpacity[key];
          let borderOpacity = 0.4;

          if (someHovered) {
            if (isHovered) {
              fillOpacity = 0.3;
              borderOpacity = 0.8;
            } else {
              fillOpacity = 0.03;
              borderOpacity = 0.15;
            }
          }

          map.setPaintProperty(fillId, "fill-opacity", fillOpacity);
          map.setPaintProperty(borderId, "line-opacity", borderOpacity);
        }
      }
    }

    updateZoneLayers();
    watch([zoneVisibility, hoveredZone], updateZoneLayers, { deep: true });

    // --- Transit visibility + hover highlight ---
    const DEFAULT_LINE_OPACITY: Record<TransitKey, number> = {
      train: 0.1,
      metro: 0.1,
      tram: 0.1,
    };
    const DEFAULT_CIRCLE_OPACITY: Record<TransitKey, number> = {
      train: 0.6,
      metro: 0.6,
      tram: 0.5,
    };
    const DEFAULT_LABEL_OPACITY: Record<TransitKey, number> = {
      train: 0.7,
      metro: 0.7,
      tram: 1,
    };

    function updateTransitLayers() {
      const hovered = hoveredTransit.value;
      const someHovered = hovered !== null;

      for (const key of TRANSIT_KEYS) {
        const visible = transitVisibility.value[key];
        const isHovered = hovered === key;

        for (const layerId of TRANSIT_LAYERS[key]) {
          if (!map.getLayer(layerId)) continue;
          map.setLayoutProperty(
            layerId,
            "visibility",
            visible ? "visible" : "none",
          );

          if (visible) {
            const isLine = layerId.includes("line");
            const defaultOp = isLine
              ? DEFAULT_LINE_OPACITY[key]
              : DEFAULT_CIRCLE_OPACITY[key];
            const op = someHovered
              ? isHovered
                ? 1
                : defaultOp * 0.3
              : defaultOp;

            if (isLine) {
              map.setPaintProperty(layerId, "line-opacity", op);
            } else {
              map.setPaintProperty(layerId, "circle-opacity", op);
            }
          }
        }

        // HTML label markers
        for (const marker of transitMarkers[key]) {
          const el = marker.getElement();
          if (!visible) {
            el.style.display = "none";
          } else {
            el.style.display = "";
            const defaultOp = DEFAULT_LABEL_OPACITY[key];
            el.style.opacity = String(
              someHovered ? (isHovered ? 1 : defaultOp * 0.3) : defaultOp,
            );
          }
        }
      }
    }

    updateTransitLayers();
    watch([transitVisibility, hoveredTransit], updateTransitLayers, {
      deep: true,
    });

    // --- Funda visibility (new + viewed as independent toggles) ---
    const FUNDA_LAYERS = [
      "funda-circles",
      "funda-building-fill",
      "funda-building-outline",
    ];

    function updateFundaLayer() {
      if (!map.getLayer("funda-circles")) return;
      const showNew = fundaNewVisible.value;
      const showViewed = fundaViewedVisible.value;

      if (!showNew && !showViewed) {
        for (const id of FUNDA_LAYERS) {
          map.setLayoutProperty(id, "visibility", "none");
        }
      } else {
        for (const id of FUNDA_LAYERS) {
          map.setLayoutProperty(id, "visibility", "visible");
        }
        let filter: maplibregl.FilterSpecification | null = null;
        if (showNew && !showViewed) {
          filter = ["!=", ["get", "clicked"], true];
        } else if (!showNew && showViewed) {
          filter = ["==", ["get", "clicked"], true];
        }
        for (const id of FUNDA_LAYERS) {
          map.setFilter(id, filter);
        }
      }
    }

    updateFundaLayer();
    watch([fundaNewVisible, fundaViewedVisible], updateFundaLayer);

    // --- Building highlight handler ---
    let lastBuildingViewKey = "";
    let buildingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    function updateBuildingHighlights() {
      const emptyData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [],
      };
      const src = map.getSource("funda-buildings") as maplibregl.GeoJSONSource;
      if (!src) return;

      if (map.getZoom() < 15) {
        if (lastBuildingViewKey !== "empty") {
          lastBuildingViewKey = "empty";
          src.setData(emptyData);
          map.setPaintProperty("funda-circles", "circle-radius", 5);
          map.setPaintProperty("funda-circles", "circle-stroke-width", 1);
        }
        return;
      }

      // Wait for vector tiles to finish loading — querying before this
      // returns generalized block polygons from lower-zoom tiles
      if (!map.isSourceLoaded("openmaptiles")) return;

      // Skip if viewport hasn't meaningfully changed
      const b = map.getBounds();
      const viewKey = `${map.getZoom().toFixed(1)}:${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getNorth().toFixed(4)}`;
      if (viewKey === lastBuildingViewKey) return;
      lastBuildingViewKey = viewKey;

      // Get visible funda features (respecting current filters)
      const visibleFeatures = map.queryRenderedFeatures(undefined, {
        layers: ["funda-circles"],
      });
      if (visibleFeatures.length === 0) {
        src.setData(emptyData);
        return;
      }

      // Deduplicate by URL (queryRenderedFeatures can return duplicates across tiles)
      const seen = new Set<string>();
      const unique: GeoJSON.Feature[] = [];
      for (const f of visibleFeatures) {
        const url = f.properties?.url;
        if (url && !seen.has(url)) {
          seen.add(url);
          unique.push(f);
        }
      }

      const { buildings } = matchBuildingsToFunda(
        map,
        unique,
        clickedFundaUrls.value,
      );
      src.setData(buildings);
      // Hide dots when building highlights are active (same frame, no flash)
      const hideDots = buildings.features.length > 0;
      map.setPaintProperty("funda-circles", "circle-radius", hideDots ? 0 : 5);
      map.setPaintProperty(
        "funda-circles",
        "circle-stroke-width",
        hideDots ? 0 : 1,
      );
    }

    let lastBuildingUpdateTime = 0;
    const THROTTLE_MS = 80;

    function throttledBuildingUpdate() {
      const now = Date.now();
      if (now - lastBuildingUpdateTime >= THROTTLE_MS) {
        lastBuildingUpdateTime = now;
        updateBuildingHighlights();
      } else {
        // Schedule a trailing update for when the gesture ends
        if (buildingDebounceTimer) clearTimeout(buildingDebounceTimer);
        buildingDebounceTimer = setTimeout(() => {
          lastBuildingUpdateTime = Date.now();
          updateBuildingHighlights();
        }, THROTTLE_MS);
      }
    }

    map.on("move", throttledBuildingUpdate);
    map.once("idle", updateBuildingHighlights);

    // When new vector tiles load (e.g. after a fast zoom), re-query buildings
    // since the tile data may now have individual footprints instead of blocks
    map.on("sourcedata", (e) => {
      if (e.sourceId === "openmaptiles" && map.getZoom() >= 15) {
        lastBuildingViewKey = "";
        throttledBuildingUpdate();
      }
    });

    // --- Cycling route watcher ---
    function routeToFeature(
      geometry: GeoJSON.LineString,
    ): GeoJSON.FeatureCollection {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry, properties: {} }],
      };
    }

    watch(activeRoutes, (routes) => {
      const fhSrc = map.getSource(
        "cycling-route-fareharbor",
      ) as maplibregl.GeoJSONSource;
      const awSrc = map.getSource(
        "cycling-route-airwallex",
      ) as maplibregl.GeoJSONSource;
      if (!fhSrc || !awSrc) return;

      if (routes?.fareharbor) {
        fhSrc.setData(routeToFeature(routes.fareharbor.geometry));
      } else {
        fhSrc.setData(emptyFC);
      }

      if (routes?.airwallex) {
        awSrc.setData(routeToFeature(routes.airwallex.geometry));
      } else {
        awSrc.setData(emptyFC);
      }

      // Update cycling times in the live popup DOM
      const timesEl = document.querySelector(".funda-cycling-times");
      if (!timesEl) return;

      if (!routes?.fareharbor && !routes?.airwallex) {
        timesEl.innerHTML = "";
        return;
      }

      const parts: string[] = [];
      if (routes?.fareharbor) {
        parts.push(
          `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeFareharbor}"></span><span style="color:${COLORS.routeFareharbor}">${routes.fareharbor.duration} min</span> to ${OFFICES.fareharbor.name}</span>`,
        );
      }
      if (routes?.airwallex) {
        parts.push(
          `<span class="funda-cycling-row"><span class="funda-cycling-dot" style="background:${COLORS.routeAirwallex}"></span><span style="color:${COLORS.routeAirwallex}">${routes.airwallex.duration} min</span> to ${OFFICES.airwallex.name}</span>`,
        );
      }
      timesEl.innerHTML = parts.join("");
    });

    watch(routesLoading, (loading) => {
      const timesEl = document.querySelector(".funda-cycling-times");
      if (!timesEl) return;
      if (loading) {
        timesEl.innerHTML = `<span class="funda-cycling-loading"><span></span><span></span></span>`;
      }
    });

    // Funda popup handler
    let fundaPopup: maplibregl.Popup | null = null;

    function showFundaPopup(
      feature: maplibregl.MapGeoJSONFeature | GeoJSON.Feature,
      lngLatOverride?: [number, number],
    ) {
      const coords =
        lngLatOverride ??
        ((feature.geometry as GeoJSON.Point).coordinates.slice() as [
          number,
          number,
        ]);
      const p = feature.properties as Record<string, any>;

      const listPrice = Number(p.price);
      const overbidPrice = Math.round(listPrice * 1.15);
      const fmtOverbid = `€${overbidPrice.toLocaleString("nl-NL")}`;
      const fmtList = `€${listPrice.toLocaleString("nl-NL")}`;
      const details = [
        p.livingArea ? `${p.livingArea} m²` : null,
        p.bedrooms ? `${p.bedrooms} bedrooms` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      let photos: string[] = [];
      try {
        photos = JSON.parse(p.photos || "[]");
      } catch {
        if (p.photo) photos = [p.photo];
      }

      const cell = (url: string) =>
        `<div style="background-image:url(${url})"></div>`;
      let gridHtml = "";
      if (photos.length >= 3) {
        gridHtml =
          `<div class="funda-grid funda-grid--3">` +
          cell(photos[0]) +
          cell(photos[1]) +
          cell(photos[2]) +
          `</div>`;
      } else if (photos.length === 2) {
        gridHtml =
          `<div class="funda-grid funda-grid--2">` +
          cell(photos[0]) +
          cell(photos[1]) +
          `</div>`;
      } else if (photos.length === 1) {
        gridHtml =
          `<div class="funda-grid funda-grid--1">` + cell(photos[0]) + `</div>`;
      }

      if (fundaPopup) fundaPopup.remove();
      fundaPopup = new maplibregl.Popup({
        offset: 12,
        closeButton: false,
        maxWidth: "none",
        className: "funda-popup",
      })
        .setLngLat(coords)
        .setHTML(
          `<a href="${p.url}" target="_blank" rel="noopener" class="funda-popup-link">` +
            gridHtml +
            `<div class="funda-bar">` +
            `<div>` +
            `<div class="funda-bar-price">${fmtOverbid}</div>` +
            `<div class="funda-bar-asking">asking ${fmtList}</div>` +
            `</div>` +
            (details ? `<div class="funda-bar-details">${details}</div>` : "") +
            `</div>` +
            `</a>` +
            `<div class="funda-cycling-times"></div>`,
        )
        .addTo(map);

      // Track click to mark listing as visited
      const linkEl = fundaPopup
        .getElement()
        ?.querySelector(".funda-popup-link");
      if (linkEl) {
        linkEl.addEventListener("click", () => {
          markFundaClicked(p.url);
          // Update source data so dot turns grey
          const src = map.getSource("funda") as maplibregl.GeoJSONSource;
          if (src) src.setData(stampClickedState(funda));
          // Refresh building highlights to update colors
          lastBuildingViewKey = "";
          updateBuildingHighlights();
        });
      }
    }

    let fundaCloseTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleFundaClose() {
      if (fundaCloseTimer) clearTimeout(fundaCloseTimer);
      fundaCloseTimer = setTimeout(() => {
        if (fundaPopup) {
          fundaPopup.remove();
          fundaPopup = null;
        }
        clearRoutes();
      }, 200);
    }

    function cancelFundaClose() {
      if (fundaCloseTimer) {
        clearTimeout(fundaCloseTimer);
        fundaCloseTimer = null;
      }
    }

    function attachPopupHover() {
      const el = fundaPopup?.getElement();
      if (el) {
        el.addEventListener("mouseenter", cancelFundaClose);
        el.addEventListener("mouseleave", scheduleFundaClose);
      }
    }

    function triggerRoutesForFeature(
      feature: maplibregl.MapGeoJSONFeature | GeoJSON.Feature,
    ) {
      const p = feature.properties as Record<string, any>;
      const coords = (feature.geometry as GeoJSON.Point).coordinates;
      if (p?.url && coords) {
        showRoutesForListing(coords[1], coords[0], p.url);
      }
    }

    map.on("mouseenter", "funda-circles", (e) => {
      map.getCanvas().style.cursor = "pointer";
      cancelFundaClose();
      if (e.features && e.features.length > 0) {
        showFundaPopup(e.features[0]);
        attachPopupHover();
        triggerRoutesForFeature(e.features[0]);
      }
    });
    map.on("mouseleave", "funda-circles", () => {
      map.getCanvas().style.cursor = "";
      scheduleFundaClose();
    });

    // Touch fallback: tap to open, tap elsewhere to close
    map.on("click", "funda-circles", (e) => {
      if (e.features && e.features.length > 0) {
        cancelFundaClose();
        showFundaPopup(e.features[0]);
        triggerRoutesForFeature(e.features[0]);
      }
    });

    // --- Building highlight interaction handlers ---
    map.on("mouseenter", "funda-building-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
      cancelFundaClose();
      if (e.features && e.features.length > 0) {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        showFundaPopup(e.features[0], lngLat);
        attachPopupHover();
        triggerRoutesForFeature(e.features[0]);
      }
    });
    map.on("mouseleave", "funda-building-fill", () => {
      map.getCanvas().style.cursor = "";
      scheduleFundaClose();
    });
    map.on("click", "funda-building-fill", (e) => {
      if (e.features && e.features.length > 0) {
        cancelFundaClose();
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        showFundaPopup(e.features[0], lngLat);
        triggerRoutesForFeature(e.features[0]);
      }
    });
  });
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
}
</style>

<style>
@import url("https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap");

.maplibregl-popup-content {
  border-radius: 8px !important;
  padding: 10px 12px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
  overflow: hidden;
}

.funda-popup .maplibregl-popup-content {
  padding: 0 !important;
  border-radius: 10px !important;
  width: 280px !important;
}

.funda-popup-link {
  text-decoration: none;
  color: inherit;
  display: block;
  position: relative;
  cursor: pointer;
}

.funda-grid {
  width: 280px;
  height: 180px;
  display: grid;
  gap: 2px;
  background: #e5e5e5;
  overflow: hidden;
}

.funda-grid > div {
  background-size: cover;
  background-position: center;
}

.funda-grid--3 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.funda-grid--3 > div:first-child {
  grid-row: 1 / -1;
}

.funda-grid--2 {
  grid-template-columns: 1fr 1fr;
}

.funda-grid--1 {
  grid-template-columns: 1fr;
}

.funda-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.85) 100%
  );
  padding: 32px 10px 8px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  color: #fff;
  font-family: system-ui, sans-serif;
  pointer-events: none;
}

.funda-bar-price {
  font-weight: 700;
  font-size: 14px;
}

.funda-bar-asking {
  font-size: 10px;
  opacity: 0.85;
}

.funda-bar-details {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.funda-cycling-times:empty {
  display: none;
}

.funda-cycling-times {
  padding: 6px 10px;
  font-family: system-ui, sans-serif;
  font-size: 11px;
  color: #555;
  border-top: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.funda-cycling-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.funda-cycling-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.funda-cycling-loading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.funda-cycling-loading > span {
  height: 10px;
  border-radius: 4px;
  background: #e5e5e5;
  animation: pulse 1s ease-in-out infinite;
}

.funda-cycling-loading > span:first-child {
  width: 120px;
}

.funda-cycling-loading > span:last-child {
  width: 100px;
  animation-delay: 0.15s;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
</style>
