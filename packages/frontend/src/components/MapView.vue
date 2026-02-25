<template>
  <div ref="mapContainer" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { fetchIsochrone, fetchStations, fetchLines, fetchFunda } from "@/api/client";
import { useZoneState } from "@/composables/useZoneState";
import { useListingStore } from "@/composables/useListingStore";
import { useMap } from "@/composables/useMap";
import { useOfficeMarkers } from "@/composables/useOfficeMarkers";
import { useIsochroneLayers } from "@/composables/useIsochroneLayers";
import { useTransitLayers } from "@/composables/useTransitLayers";
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
  fundaCount,
} = useZoneState();

const { listings, selectedListing, viewedFundaIds, selectListing, setListings } = useListingStore();

const { initMap } = useMap(mapContainer);

onMounted(async () => {
  const map = await initMap();
  useOfficeMarkers(map);

  map.on("load", async () => {
    // Fire all fetches simultaneously
    const fundaPromise = fetchFunda();
    const [isochrone, stations, lines] = await Promise.all([
      fetchIsochrone(),
      fetchStations(),
      fetchLines(),
    ]);

    useIsochroneLayers(map, isochrone, { zoneVisibility, hoveredZone });
    useTransitLayers(map, stations, lines, { transitVisibility, hoveredTransit });

    // Await funda (fetch was already fired in parallel, may already be resolved)
    const fundaData = await fundaPromise;
    setListings(fundaData);

    const { refreshFundaSource } = useFundaLayer(map, listings, {
      viewedFundaIds,
      fundaCount,
      fundaNewVisible,
      fundaViewedVisible,
    });

    const { updateBuildingHighlights, resetBuildingViewKey } = useBuildingHighlightLayer(
      map,
      viewedFundaIds,
    );

    useMapPopups({
      map,
      listings,
      selectListing,
      refreshFundaSource,
      updateBuildingHighlights,
      resetBuildingViewKey,
    });

    // Re-derive GeoJSON when viewed state changes (e.g. after modal marks a listing viewed)
    watch(viewedFundaIds, () => {
      refreshFundaSource();
      resetBuildingViewKey();
      updateBuildingHighlights();
    });
  });
});
</script>
