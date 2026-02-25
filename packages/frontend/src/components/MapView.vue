<template>
  <div ref="mapContainer" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchIsochrone, fetchStations, fetchLines, fetchFunda } from "@/api/client";
import { useZoneState } from "@/composables/useZoneState";
import { useCyclingRoutes } from "@/composables/useCyclingRoutes";
import { useMap } from "@/composables/useMap";
import { useOfficeMarkers } from "@/composables/useOfficeMarkers";
import { useIsochroneLayers } from "@/composables/useIsochroneLayers";
import { useTransitLayers } from "@/composables/useTransitLayers";
import { useRouteLayers } from "@/composables/useRouteLayers";
import { useFundaLayer } from "@/composables/useFundaLayer";
import { useBuildingHighlightLayer } from "@/composables/useBuildingHighlightLayer";
import { useMapPopups } from "@/composables/useMapPopups";

const mapContainer = ref<HTMLDivElement>();

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

const { activeRoutes, showRoutesForListing, clearRoutes } = useCyclingRoutes();
const { initMap } = useMap(mapContainer);

onMounted(async () => {
  const map = await initMap();
  useOfficeMarkers(map);

  map.on("load", async () => {
    const [isochrone, stations, lines, funda] = await Promise.all([
      fetchIsochrone(),
      fetchStations(),
      fetchLines(),
      fetchFunda(),
    ]);

    useIsochroneLayers(map, isochrone, { zoneVisibility, hoveredZone });
    useTransitLayers(map, stations, lines, { transitVisibility, hoveredTransit });
    useRouteLayers(map, activeRoutes);

    const { stampClickedState } = useFundaLayer(map, funda, {
      clickedFundaUrls,
      fundaCount,
      fundaNewVisible,
      fundaViewedVisible,
    });

    const { updateBuildingHighlights, resetBuildingViewKey } = useBuildingHighlightLayer(
      map,
      clickedFundaUrls,
    );

    useMapPopups({
      map,
      funda,
      markFundaClicked,
      clickedFundaUrls,
      stampClickedState,
      updateBuildingHighlights,
      resetBuildingViewKey,
      showRoutesForListing,
      clearRoutes,
    });
  });
});
</script>
