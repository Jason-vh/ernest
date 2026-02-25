import { ref } from "vue";
import type { CyclingRoutes } from "@ernest/shared";

const activeRoutes = ref<CyclingRoutes | null>(null);

function showRoutesForListing(precomputed: CyclingRoutes | null) {
  activeRoutes.value = precomputed;
}

function clearRoutes() {
  activeRoutes.value = null;
}

export function useCyclingRoutes() {
  return {
    activeRoutes,
    showRoutesForListing,
    clearRoutes,
  };
}
