<template>
  <div ref="mapContainer" class="w-full h-full"></div>

  <Transition name="fade">
    <div
      v-if="listingsLoading"
      class="pointer-events-none absolute top-3 left-1/2 z-2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/55 px-3 py-1.5 text-[12px] font-medium text-[#666] shadow-sm backdrop-blur-2xl"
      role="status"
      aria-live="polite"
    >
      <svg class="h-3.5 w-3.5 animate-spin text-[#888]" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-opacity="0.25"
          stroke-width="3"
        />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
      Loading listings…
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { fetchStations, fetchLines } from "@/api/client";
import { useZoneState } from "@/composables/useZoneState";
import { useListingStore } from "@/composables/useListingStore";
import { useMap } from "@/composables/useMap";
import { setMap, flyTo } from "@/composables/useMapPosition";
import { useOfficeMarkers } from "@/composables/useOfficeMarkers";
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
  fundaViewingVisible,
  fundaAppliedVisible,
  hoveredZone,
  hoveredTransit,
  fundaFavouriteCount,
  fundaUnreviewedCount,
  fundaDiscardedCount,
  fundaViewingCount,
  fundaAppliedCount,
} = useZoneState();

const {
  listings,
  favouriteIds,
  discardedIds,
  lastViewedFundaId,
  clusterListingIds,
  selectListing,
  consumeDeepLink,
  loadListings,
  listingsLoading,
  findColocatedIds,
} = useListingStore();

const { initMap } = useMap(mapContainer);

onBeforeUnmount(() => {
  // Drop the global map ref so flyTo() callers (e.g. from /activity) queue
  // until the next MapView mount instead of firing on a destroyed map
  setMap(null);
});

onMounted(async () => {
  const map = await initMap();
  setMap(map);
  useOfficeMarkers(map);

  map.on("load", async () => {
    // Funda fetch was kicked off in App.vue on app mount; this awaits the cached promise
    const fundaPromise = loadListings();
    const [stations, lines] = await Promise.all([fetchStations(), fetchLines()]);

    useTransitLayers(map, stations, lines, { transitVisibility, hoveredTransit });

    await fundaPromise;

    // Fly to deep-linked listing if opened via URL
    const deepLinkedId = consumeDeepLink();
    if (deepLinkedId) {
      const listing = listings.value.get(deepLinkedId);
      if (listing) {
        flyTo(listing.longitude, listing.latitude);
        clusterListingIds.value = findColocatedIds(deepLinkedId);
      }
    }

    const { refreshFundaSource } = useFundaLayer(map, listings, {
      favouriteIds,
      discardedIds,
      lastViewedFundaId,
      fundaFavouriteVisible,
      fundaUnreviewedVisible,
      fundaDiscardedVisible,
      fundaViewingVisible,
      fundaAppliedVisible,
      fundaFavouriteCount,
      fundaUnreviewedCount,
      fundaDiscardedCount,
      fundaViewingCount,
      fundaAppliedCount,
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
      fundaViewingVisible,
      fundaAppliedVisible,
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

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
