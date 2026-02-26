import { ref, computed, watch } from "vue";
import type { Listing, ReactionType, ListingNote } from "@ernest/shared";
import { putReaction, putNote } from "@/api/client";

const listings = ref<Map<string, Listing>>(new Map());
const selectedFundaId = ref<string | null>(null);
const clusterListingIds = ref<string[]>([]);
const lastViewedFundaId = ref<string | null>(null);

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
    setReaction,
    saveNote,
    findColocatedIds,
  };
}
