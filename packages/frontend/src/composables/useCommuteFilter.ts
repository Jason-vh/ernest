import { computed, type Ref } from "vue";
import { useZoneState } from "@/composables/useZoneState";
import { type ListingId } from "@/composables/useListingStore";
import type { Listing } from "@ernest/shared";

interface Props {
  listings: Ref<Map<ListingId, Listing>>;
}

export function useCommuteFilter(props: Props) {
  const { maxMinutesFromCentraal } = useZoneState();

  const filteredListings = computed(() => {
    const result = new Map<ListingId, Listing>();
    for (const [id, listing] of props.listings.value.entries()) {
      const duration = listing.routeCentraal?.duration ?? null;
      if (duration === null || duration <= maxMinutesFromCentraal.value) {
        result.set(id, listing);
      }
    }
    return result;
  });

  return { filteredListings };
}
