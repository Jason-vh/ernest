<template>
  <div ref="mapContainer" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { fetchIsochrone, fetchStations, fetchLines, fetchFunda } from "@/api/client";
import { useZoneState } from "@/composables/useZoneState";
import { useListingStore } from "@/composables/useListingStore";
import { useMap } from "@/composables/useMap";
import { setMap, flyTo } from "@/composables/useMapPosition";
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
  fundaFavouriteVisible,
  fundaUnreviewedVisible,
  fundaDiscardedVisible,
  hoveredZone,
  hoveredTransit,
  fundaFavouriteCount,
  fundaUnreviewedCount,
  fundaDiscardedCount,
} = useZoneState();

const { listings, favouriteIds, discardedIds, selectListing, consumeDeepLink, setListings } =
  useListingStore();

const { initMap } = useMap(mapContainer);

onMounted(async () => {
  const map = await initMap();
  setMap(map);
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

    // Fly to deep-linked listing if opened via URL
    const deepLinkedId = consumeDeepLink();
    if (deepLinkedId) {
      const listing = listings.value.get(deepLinkedId);
      if (listing) {
        flyTo(listing.longitude, listing.latitude);
      }
    }

    const { refreshFundaSource } = useFundaLayer(map, listings, {
      favouriteIds,
      discardedIds,
      fundaFavouriteVisible,
      fundaUnreviewedVisible,
      fundaDiscardedVisible,
      fundaFavouriteCount,
      fundaUnreviewedCount,
      fundaDiscardedCount,
    });

    const { updateBuildingHighlights, resetBuildingViewKey } = useBuildingHighlightLayer(
      map,
      favouriteIds,
      discardedIds,
    );

    useMapPopups({
      map,
      listings,
      selectListing,
      fundaFavouriteVisible,
      fundaUnreviewedVisible,
      fundaDiscardedVisible,
    });

    // Re-derive GeoJSON when reaction state changes
    watch([favouriteIds, discardedIds], () => {
      refreshFundaSource();
      resetBuildingViewKey();
      updateBuildingHighlights();
    });
  });
});
</script>
