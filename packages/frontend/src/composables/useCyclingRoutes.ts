import { ref } from "vue";
import { fetchCyclingRoutes, type CyclingRoutes } from "../api/client";

const activeRoutes = ref<CyclingRoutes | null>(null);
const routesLoading = ref(false);

// Client-side cache keyed by listing URL
const routeCache = new Map<string, CyclingRoutes>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

function showRoutesForListing(lat: number, lon: number, listingUrl: string) {
  // Cancel any pending debounce
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Check cache first (no debounce needed)
  const cached = routeCache.get(listingUrl);
  if (cached) {
    activeRoutes.value = cached;
    routesLoading.value = false;
    return;
  }

  routesLoading.value = true;

  debounceTimer = setTimeout(async () => {
    // Abort any in-flight requests
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    const result = await fetchCyclingRoutes({ lat, lon }, signal);

    // Ignore if aborted (user moved to different listing)
    if (signal.aborted) return;

    const routes: CyclingRoutes = result ?? { fareharbor: null, airwallex: null };
    routeCache.set(listingUrl, routes);
    activeRoutes.value = routes;
    routesLoading.value = false;
  }, 150);
}

function clearRoutes() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  activeRoutes.value = null;
  routesLoading.value = false;
}

export function useCyclingRoutes() {
  return {
    activeRoutes,
    routesLoading,
    showRoutesForListing,
    clearRoutes,
  };
}
