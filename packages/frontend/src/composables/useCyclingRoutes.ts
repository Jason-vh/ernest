import { ref } from "vue";
import { OFFICES } from "../geo/constants";
import { fetchCyclingRoute, type CyclingRoute } from "../api/client";

export interface ActiveRoutes {
  fareharbor: CyclingRoute | null;
  airwallex: CyclingRoute | null;
}

const activeRoutes = ref<ActiveRoutes | null>(null);
const routesLoading = ref(false);

// Client-side cache keyed by listing URL
const routeCache = new Map<string, ActiveRoutes>();

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

    const from = { lat, lon };

    const [fareharbor, airwallex] = await Promise.all([
      fetchCyclingRoute(from, OFFICES.fareharbor, signal),
      fetchCyclingRoute(from, OFFICES.airwallex, signal),
    ]);

    // Ignore if aborted (user moved to different listing)
    if (signal.aborted) return;

    const routes: ActiveRoutes = { fareharbor, airwallex };
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
