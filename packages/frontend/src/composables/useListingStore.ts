import { ref, computed, watch } from "vue";
import type { Listing, ReactionType, ListingNote } from "@ernest/shared";
import {
  fetchFunda,
  putReaction,
  putNote,
  putViewing,
  deleteViewing,
  analyzeCatch as apiAnalyzeCatch,
  translateDescription as apiTranslateDescription,
} from "@/api/client";

export type ListingId = string;

const listings = ref<Map<ListingId, Listing>>(new Map());
const selectedFundaId = ref<ListingId | null>(null);
const clusterListingIds = ref<ListingId[]>([]);
const lastViewedFundaId = ref<ListingId | null>(null);

// Track when modal closes: record the last-viewed listing for map highlight
watch(selectedFundaId, (newVal, oldVal) => {
  if (newVal === null && oldVal !== null) {
    // Modal just closed — highlight the listing that was being viewed
    lastViewedFundaId.value = oldVal;
  } else if (newVal !== null) {
    // A new listing is being opened — clear the previous highlight
    lastViewedFundaId.value = null;
  }
});
let pushedState = false;

// One-time cleanup of old localStorage viewed tracking
localStorage.removeItem("ernest:viewedFunda");

// Read initial ?listing= param for deep-links
const initialParam = new URLSearchParams(window.location.search).get("listing");
let deepLinkedId: string | null = null;
if (initialParam) {
  selectedFundaId.value = initialParam;
  deepLinkedId = initialParam;
}

function consumeDeepLink(): string | null {
  const id = deepLinkedId;
  deepLinkedId = null;
  return id;
}

const selectedListing = computed(() => {
  if (!selectedFundaId.value) return null;
  return listings.value.get(selectedFundaId.value) ?? null;
});

// Derived sets from listing data
const favouriteIds = computed(() => {
  const ids = new Set<string>();
  for (const [id, listing] of listings.value) {
    if (listing.reaction === "favourite") ids.add(id);
  }
  return ids;
});

const discardedIds = computed(() => {
  const ids = new Set<string>();
  for (const [id, listing] of listings.value) {
    if (listing.reaction === "discarded") ids.add(id);
  }
  return ids;
});

const currentClusterIndex = computed(() => {
  if (!selectedFundaId.value || clusterListingIds.value.length === 0) return -1;
  return clusterListingIds.value.indexOf(selectedFundaId.value);
});

function selectListing(fundaId: string, opts?: { clusterIds?: string[] }) {
  clusterListingIds.value = opts?.clusterIds ?? [];

  if (selectedFundaId.value === fundaId) return;

  // Push a history entry so Back button closes the modal
  const params = new URLSearchParams(window.location.search);
  params.set("listing", fundaId);
  params.delete("photo");
  const url = `${window.location.pathname}?${params.toString()}`;
  history.pushState({ listing: fundaId }, "", url);
  pushedState = true;

  selectedFundaId.value = fundaId;
}

function navigateCluster(dir: 1 | -1) {
  const ids = clusterListingIds.value;
  if (ids.length < 2) return;
  const idx = currentClusterIndex.value;
  if (idx < 0) return;
  const next = (idx + dir + ids.length) % ids.length;
  const nextId = ids[next];

  // Replace URL (don't push new history for cluster navigation)
  const params = new URLSearchParams(window.location.search);
  params.set("listing", nextId);
  params.delete("photo");
  const url = `${window.location.pathname}?${params.toString()}`;
  history.replaceState({ listing: nextId }, "", url);
  selectedFundaId.value = nextId;
}

function closeModal() {
  if (!selectedFundaId.value) return;
  clusterListingIds.value = [];

  if (pushedState) {
    history.back();
    // popstate handler will clear selectedFundaId
  } else {
    // Deep-link case: remove param without adding history entry
    const params = new URLSearchParams(window.location.search);
    params.delete("listing");
    params.delete("photo");
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    history.replaceState(null, "", url);
    selectedFundaId.value = null;
  }
  pushedState = false;
}

function dismissModal() {
  if (!selectedFundaId.value) return;
  clusterListingIds.value = [];
  const params = new URLSearchParams(window.location.search);
  params.delete("listing");
  params.delete("photo");
  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  history.replaceState(null, "", url);
  selectedFundaId.value = null;
  pushedState = false;
}

// Sync state on browser Back/Forward
window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  const fundaId = params.get("listing");
  selectedFundaId.value = fundaId;
  pushedState = false;
});

/**
 * Sync the store from the current URL — for vue-router navigations
 * (e.g. clicking a listing on the activity page) that don't go through
 * selectListing/popstate.
 */
function syncFromUrl() {
  const param = new URLSearchParams(window.location.search).get("listing");
  if (param) {
    if (selectedFundaId.value !== param) {
      selectedFundaId.value = param;
      // Re-arm the deep-link so MapView flies to the listing on next mount
      deepLinkedId = param;
      pushedState = false;
    }
  } else if (selectedFundaId.value !== null) {
    selectedFundaId.value = null;
    pushedState = false;
  }
}

const listingsLoading = ref(false);
let listingsLoadPromise: Promise<Listing[]> | null = null;

function loadListings(): Promise<Listing[]> {
  if (listingsLoadPromise) return listingsLoadPromise;
  listingsLoading.value = true;
  listingsLoadPromise = fetchFunda()
    .then((data) => {
      setListings(data);
      return data;
    })
    .finally(() => {
      listingsLoading.value = false;
    });
  return listingsLoadPromise;
}

function setListings(items: Listing[]) {
  const map = new Map<string, Listing>();
  for (const item of items) {
    map.set(item.fundaId, item);
  }
  listings.value = map;

  // If deep-linked listing doesn't exist, clear the param
  if (selectedFundaId.value && !map.has(selectedFundaId.value)) {
    deepLinkedId = null;
    const params = new URLSearchParams(window.location.search);
    params.delete("listing");
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    history.replaceState(null, "", url);
    selectedFundaId.value = null;
  }
}

async function setReaction(fundaId: string, reaction: ReactionType | null, username: string) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;

  // Optimistic update: clone listing with new reaction, replace Map ref for reactivity
  const prev = { reaction: listing.reaction, reactionBy: listing.reactionBy };
  const updated = {
    ...listing,
    reaction,
    reactionBy: reaction ? username : null,
  };
  const newMap = new Map(listings.value);
  newMap.set(fundaId, updated);
  listings.value = newMap;

  try {
    await putReaction(fundaId, reaction);
  } catch {
    // Rollback on failure
    const rollback = { ...updated, reaction: prev.reaction, reactionBy: prev.reactionBy };
    const rollbackMap = new Map(listings.value);
    rollbackMap.set(fundaId, rollback);
    listings.value = rollbackMap;
  }
}

async function saveNote(fundaId: string, text: string, user: { id: string; username: string }) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;

  try {
    await putNote(fundaId, text);

    // Update listing with new note
    const trimmed = text.trim();
    let newNotes: ListingNote[];
    if (trimmed === "") {
      newNotes = listing.notes.filter((n) => n.userId !== user.id);
    } else {
      const existingIdx = listing.notes.findIndex((n) => n.userId === user.id);
      if (existingIdx >= 0) {
        newNotes = [...listing.notes];
        newNotes[existingIdx] = {
          userId: user.id,
          username: user.username,
          text: trimmed,
          updatedAt: new Date().toISOString(),
        };
      } else {
        newNotes = [
          ...listing.notes,
          {
            userId: user.id,
            username: user.username,
            text: trimmed,
            updatedAt: new Date().toISOString(),
          },
        ];
      }
    }

    const updated = { ...listing, notes: newNotes };
    const newMap = new Map(listings.value);
    newMap.set(fundaId, updated);
    listings.value = newMap;
  } catch {
    // Note save failed — listing stays unchanged
  }
}

async function setViewing(
  fundaId: string,
  scheduledAt: string,
  note: string | null,
  username: string,
) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;

  const prev = listing.viewing;
  const optimistic = {
    scheduledAt,
    note,
    scheduledBy: username,
    updatedAt: new Date().toISOString(),
  };

  const newMap = new Map(listings.value);
  newMap.set(fundaId, { ...listing, viewing: optimistic });
  listings.value = newMap;

  try {
    await putViewing(fundaId, scheduledAt, note);
  } catch {
    const rollbackMap = new Map(listings.value);
    rollbackMap.set(fundaId, { ...listing, viewing: prev });
    listings.value = rollbackMap;
    throw new Error("Failed to save viewing");
  }
}

const analyzingCatchIds = ref<Set<string>>(new Set());
const catchErrors = ref<Map<string, string>>(new Map());

async function analyzeCatch(fundaId: string) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;
  if (analyzingCatchIds.value.has(fundaId)) return;

  // Optimistic: mark as analyzing
  const newSet = new Set(analyzingCatchIds.value);
  newSet.add(fundaId);
  analyzingCatchIds.value = newSet;

  // Clear any previous error for this listing
  if (catchErrors.value.has(fundaId)) {
    const newErrors = new Map(catchErrors.value);
    newErrors.delete(fundaId);
    catchErrors.value = newErrors;
  }

  try {
    const concerns = await apiAnalyzeCatch(fundaId);
    const current = listings.value.get(fundaId);
    if (current) {
      const newMap = new Map(listings.value);
      newMap.set(fundaId, { ...current, aiCatch: concerns });
      listings.value = newMap;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const newErrors = new Map(catchErrors.value);
    newErrors.set(fundaId, message);
    catchErrors.value = newErrors;
  } finally {
    const cleared = new Set(analyzingCatchIds.value);
    cleared.delete(fundaId);
    analyzingCatchIds.value = cleared;
  }
}

const translatingIds = ref<Set<string>>(new Set());
const translateErrors = ref<Map<string, string>>(new Map());

async function translateDescription(fundaId: string) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;
  if (translatingIds.value.has(fundaId)) return;

  const inProgress = new Set(translatingIds.value);
  inProgress.add(fundaId);
  translatingIds.value = inProgress;

  if (translateErrors.value.has(fundaId)) {
    const cleared = new Map(translateErrors.value);
    cleared.delete(fundaId);
    translateErrors.value = cleared;
  }

  try {
    const descriptionEn = await apiTranslateDescription(fundaId);
    const current = listings.value.get(fundaId);
    if (current) {
      const newMap = new Map(listings.value);
      newMap.set(fundaId, { ...current, descriptionEn });
      listings.value = newMap;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    const newErrors = new Map(translateErrors.value);
    newErrors.set(fundaId, message);
    translateErrors.value = newErrors;
  } finally {
    const cleared = new Set(translatingIds.value);
    cleared.delete(fundaId);
    translatingIds.value = cleared;
  }
}

async function clearViewing(fundaId: string) {
  const listing = listings.value.get(fundaId);
  if (!listing) return;

  const prev = listing.viewing;

  const newMap = new Map(listings.value);
  newMap.set(fundaId, { ...listing, viewing: null });
  listings.value = newMap;

  try {
    await deleteViewing(fundaId);
  } catch {
    const rollbackMap = new Map(listings.value);
    rollbackMap.set(fundaId, { ...listing, viewing: prev });
    listings.value = rollbackMap;
    throw new Error("Failed to cancel viewing");
  }
}

function findColocatedIds(fundaId: string): string[] {
  const target = listings.value.get(fundaId);
  if (!target) return [];
  const key = `${target.longitude},${target.latitude}`;
  const ids: string[] = [];
  for (const [id, listing] of listings.value) {
    if (`${listing.longitude},${listing.latitude}` === key) {
      ids.push(id);
    }
  }
  return ids.length > 1 ? ids : [];
}

export function useListingStore() {
  return {
    listings,
    selectedFundaId,
    selectedListing,
    lastViewedFundaId,
    favouriteIds,
    discardedIds,
    clusterListingIds,
    currentClusterIndex,
    selectListing,
    closeModal,
    dismissModal,
    navigateCluster,
    consumeDeepLink,
    setListings,
    loadListings,
    listingsLoading,
    setReaction,
    saveNote,
    setViewing,
    clearViewing,
    findColocatedIds,
    syncFromUrl,
    analyzeCatch,
    analyzingCatchIds,
    catchErrors,
    translateDescription,
    translatingIds,
    translateErrors,
  };
}
