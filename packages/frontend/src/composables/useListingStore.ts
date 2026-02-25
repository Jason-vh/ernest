import { ref, computed } from "vue";
import type { Listing } from "@ernest/shared";

const listings = ref<Map<string, Listing>>(new Map());
const selectedFundaId = ref<string | null>(null);
let pushedState = false;

// Read initial ?listing= param for deep-links
const initialParam = new URLSearchParams(window.location.search).get("listing");
if (initialParam) {
  selectedFundaId.value = initialParam;
}

const selectedListing = computed(() => {
  if (!selectedFundaId.value) return null;
  return listings.value.get(selectedFundaId.value) ?? null;
});

// Viewed funda IDs (persisted in localStorage, keyed by fundaId)
const VIEWED_KEY = "ernest:viewedFunda";

function loadViewedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveViewedIds(ids: Set<string>) {
  localStorage.setItem(VIEWED_KEY, JSON.stringify([...ids]));
}

const viewedFundaIds = ref(loadViewedIds());

function markViewed(fundaId: string) {
  if (viewedFundaIds.value.has(fundaId)) return;
  viewedFundaIds.value = new Set([...viewedFundaIds.value, fundaId]);
  saveViewedIds(viewedFundaIds.value);
}

function selectListing(fundaId: string) {
  markViewed(fundaId);

  // Push a history entry so Back button closes the modal
  const params = new URLSearchParams(window.location.search);
  params.set("listing", fundaId);
  const url = `${window.location.pathname}?${params.toString()}`;
  history.pushState({ listing: fundaId }, "", url);
  pushedState = true;

  selectedFundaId.value = fundaId;
}

function closeModal() {
  if (!selectedFundaId.value) return;

  if (pushedState) {
    history.back();
    // popstate handler will clear selectedFundaId
  } else {
    // Deep-link case: remove param without adding history entry
    const params = new URLSearchParams(window.location.search);
    params.delete("listing");
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    history.replaceState(null, "", url);
    selectedFundaId.value = null;
  }
  pushedState = false;
}

// Sync state on browser Back/Forward
window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  const fundaId = params.get("listing");
  selectedFundaId.value = fundaId;
  pushedState = false;
});

function setListings(items: Listing[]) {
  const map = new Map<string, Listing>();
  for (const item of items) {
    map.set(item.fundaId, item);
  }
  listings.value = map;

  // Handle deep-link: mark viewed once listings are loaded
  if (selectedFundaId.value && map.has(selectedFundaId.value)) {
    markViewed(selectedFundaId.value);
  }
  // If deep-linked listing doesn't exist, clear the param
  if (selectedFundaId.value && !map.has(selectedFundaId.value)) {
    const params = new URLSearchParams(window.location.search);
    params.delete("listing");
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    history.replaceState(null, "", url);
    selectedFundaId.value = null;
  }
}

export function useListingStore() {
  return {
    listings,
    selectedFundaId,
    selectedListing,
    viewedFundaIds,
    selectListing,
    closeModal,
    setListings,
    markViewed,
  };
}
