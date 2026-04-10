import { computed, type Ref } from "vue";
import { type ListingId } from "@/composables/useListingStore";
import type { Listing } from "@ernest/shared";

interface Props {
  listings: Ref<Map<ListingId, Listing>>;
}

export function useCommuteFilter(props: Props) {
  const filteredListings = computed(() => {
    const result = new Map<ListingId, Listing>();
    for (const [id, listing] of props.listings.value.entries()) {
      result.set(id, listing);
    }
    return result;
  });

  return { filteredListings };
}
