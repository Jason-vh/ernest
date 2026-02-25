<template>
  <div ref="mapContainer" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { fetchIsochrone, fetchStations, fetchLines, fetchFunda } from "@/api/client";
import { useZoneState } from "@/composables/useZoneState";
import { useListingStore } from "@/composables/useListingStore";
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
  fundaCount,
} = useZoneState();

const { listings, selectedListing, viewedFundaIds, selectListing, setListings } = useListingStore();

const { activeRoutes, showRoutesForListing, clearRoutes } = useCyclingRoutes();
const { initMap } = useMap(mapContainer);

onMounted(async () => {
  const map = await initMap();
  useOfficeMarkers(map);

  map.on("load", async () => {
    const [isochrone, stations, lines, fundaData] = await Promise.all([
      fetchIsochrone(),
      fetchStations(),
      fetchLines(),
      fetchFunda(),
    ]);

    setListings(fundaData);

    useIsochroneLayers(map, isochrone, { zoneVisibility, hoveredZone });
    useTransitLayers(map, stations, lines, { transitVisibility, hoveredTransit });
    useRouteLayers(map, activeRoutes);

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
      showRoutesForListing,
      clearRoutes,
    });

    // Show/clear cycling routes when modal opens/closes
    watch(selectedListing, (listing) => {
      if (listing) {
        if (listing.routeFareharbor || listing.routeAirwallex) {
          showRoutesForListing({
            fareharbor: listing.routeFareharbor,
            airwallex: listing.routeAirwallex,
          });
        }
      } else {
        clearRoutes();
      }
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
