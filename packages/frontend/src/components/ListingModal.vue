<template>
  <Teleport to="body">
    <Transition name="listing-modal">
      <div
        v-if="listing"
        class="fixed inset-0 z-100 flex items-end justify-center bg-black/20 backdrop-blur-[6px] sm:items-center"
        @click.self="close"
      >
        <div
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          aria-label="Listing details"
          class="listing-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white/90 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-[24px] sm:max-w-[580px] sm:rounded-[14px]"
          @keydown="trapFocus"
        >
          <!-- Scrollable content -->
          <div class="flex-1 overflow-y-auto overscroll-contain">
            <!-- Photo gallery with floating close button -->
            <div v-if="listing.photos.length > 0" class="relative">
              <PhotoGallery :photos="listing.photos" />
              <button
                class="absolute top-2.5 right-12 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
                title="Show on map"
                @click="showOnMap"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
              <button
                class="absolute top-2.5 right-2.5 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
                @click="close"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- No-photo fallback header -->
            <div v-else class="flex items-center justify-end gap-1.5 px-4 pt-3">
              <button
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-black/8 text-[#666] transition-colors hover:bg-black/15"
                title="Show on map"
                @click="showOnMap"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
              <button
                class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-black/8 text-[#666] transition-colors hover:bg-black/15"
                @click="close"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="flex flex-col gap-0 px-5 pt-4 pb-5">
              <!-- Address + Price row -->
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <h2 class="m-0 text-[17px] font-semibold leading-tight text-[#1a1a1a]">
                    {{ listing.address }}
                  </h2>
                  <p v-if="listing.neighbourhood" class="m-0 mt-1 text-[13px] text-[#888]">
                    {{ listing.neighbourhood
                    }}<span v-if="listing.postcode"> &middot; {{ listing.postcode }}</span>
                  </p>
                </div>
                <div class="flex-shrink-0 text-right">
                  <div class="text-[20px] font-bold tracking-[-0.02em] text-[#1a1a1a]">
                    {{ formatPrice(overbidPrice) }}
                  </div>
                  <div class="mt-0.5 text-[11px] text-[#999]">
                    asking {{ formatPrice(listing.price)
                    }}<template v-if="listingAgeDays != null">
                      &middot; {{ listingAgeDays }}d</template
                    >
                  </div>
                </div>
              </div>

              <!-- Key facts (inline) with status badge -->
              <div v-if="keyFacts" class="mt-2.5 text-[13px] text-[#666]">
                <span
                  v-if="listing.status === 'Beschikbaar'"
                  class="mr-1.5 inline-block rounded bg-emerald-500/10 px-1.5 py-[1px] text-[11px] font-semibold text-emerald-700"
                  >Available</span
                >{{ keyFacts }}
              </div>

              <!-- Divider -->
              <div class="my-4 h-px bg-black/6"></div>

              <!-- AI highlights card -->
              <div
                v-if="
                  (listing.aiPositives && listing.aiPositives.length > 0) ||
                  (listing.aiNegatives && listing.aiNegatives.length > 0)
                "
                class="highlights-card"
              >
                <div
                  v-if="listing.aiPositives && listing.aiPositives.length > 0"
                  class="flex flex-col gap-[5px]"
                >
                  <div
                    v-for="(item, i) in listing.aiPositives"
                    :key="'pos-' + i"
                    class="flex items-start gap-2 text-[13px] leading-[1.4]"
                  >
                    <span
                      class="mt-[6px] h-[6px] w-[6px] flex-shrink-0 rounded-full bg-emerald-500"
                    ></span>
                    <span class="text-[#444]">{{ item }}</span>
                  </div>
                </div>
                <div
                  v-if="
                    listing.aiPositives &&
                    listing.aiPositives.length > 0 &&
                    listing.aiNegatives &&
                    listing.aiNegatives.length > 0
                  "
                  class="my-2.5 h-px bg-black/5"
                ></div>
                <div
                  v-if="listing.aiNegatives && listing.aiNegatives.length > 0"
                  class="flex flex-col gap-[5px]"
                >
                  <div
                    v-for="(item, i) in listing.aiNegatives"
                    :key="'neg-' + i"
                    class="flex items-start gap-2 text-[13px] leading-[1.4]"
                  >
                    <span
                      class="mt-[6px] h-[6px] w-[6px] flex-shrink-0 rounded-full bg-amber-500"
                    ></span>
                    <span class="text-[#444]">{{ item }}</span>
                  </div>
                </div>
              </div>

              <!-- Cycling commute -->
              <div
                v-if="listing.routeFareharbor || listing.routeAirwallex"
                class="mt-3 text-[12px] text-[#aaa]"
              >
                <span class="mr-1">Cycling</span>
                <template v-if="listing.routeFareharbor">
                  <span class="tabular-nums text-[#888]">{{ listing.routeFareharbor }} min</span>
                  {{ OFFICES.fareharbor.name }}</template
                >
                <template v-if="listing.routeFareharbor && listing.routeAirwallex">
                  &middot;
                </template>
                <template v-if="listing.routeAirwallex">
                  <span class="tabular-nums text-[#888]">{{ listing.routeAirwallex }} min</span>
                  {{ OFFICES.airwallex.name }}</template
                >
              </div>

              <!-- Actions row -->
              <div class="mt-4 flex items-center gap-2">
                <template v-if="user">
                  <button
                    class="reaction-btn"
                    :class="{
                      'reaction-btn--active reaction-btn--fav': listing.reaction === 'favourite',
                    }"
                    @click="toggleReaction('favourite')"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                        :fill="listing.reaction === 'favourite' ? 'currentColor' : 'none'"
                      />
                    </svg>
                    Favourite
                  </button>
                  <button
                    class="reaction-btn"
                    :class="{
                      'reaction-btn--active reaction-btn--discard':
                        listing.reaction === 'discarded',
                    }"
                    @click="toggleReaction('discarded')"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    Discard
                  </button>
                  <span
                    v-if="listing.reactionBy"
                    class="ml-auto self-center text-[11px] text-[#bbb]"
                  >
                    by {{ listing.reactionBy }}
                  </span>
                </template>
                <a
                  :href="listing.url"
                  target="_blank"
                  rel="noopener"
                  class="ml-auto flex-shrink-0 rounded-full bg-black/5 px-3 py-1.5 text-[11px] font-semibold text-[#666] no-underline transition-colors hover:bg-black/10"
                  :class="{ 'ml-0': !user }"
                  >View on Funda &rarr;</a
                >
              </div>

              <!-- Divider before deep-dive sections -->
              <div class="my-4 h-px bg-black/6"></div>

              <!-- Notes (read-only display) -->
              <div v-if="listing.notes.length > 0">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Notes
                </div>
                <div v-for="note in listing.notes" :key="note.userId" class="mt-2">
                  <div class="text-[11px] font-medium text-[#999]">{{ note.username }}</div>
                  <p class="m-0 mt-0.5 whitespace-pre-line text-[13px] leading-[1.5] text-[#555]">
                    {{ note.text }}
                  </p>
                </div>
              </div>

              <!-- Description -->
              <div v-if="activeDescription" class="mt-4">
                <div class="flex items-center justify-between">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Description
                  </div>
                  <button
                    v-if="listing.aiDescription && listing.description"
                    class="cursor-pointer border-none bg-transparent p-0 font-inherit text-[11px] font-medium text-[#999] underline decoration-[#ddd] underline-offset-2 transition-colors hover:text-[#666] hover:decoration-[#aaa]"
                    @click="showOriginalDesc = !showOriginalDesc"
                  >
                    {{ showOriginalDesc ? "Show translated" : "Show original" }}
                  </button>
                </div>
                <p
                  class="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.6] text-[#555]"
                  :class="{ 'line-clamp-6': !descExpanded }"
                >
                  {{ activeDescription }}
                </p>
                <button
                  v-if="activeDescription.length > 300"
                  class="mt-1.5 cursor-pointer border-none bg-transparent p-0 font-inherit text-[12px] font-medium text-[#999] underline decoration-[#ddd] underline-offset-2 transition-colors hover:text-[#666] hover:decoration-[#aaa]"
                  @click="descExpanded = !descExpanded"
                >
                  {{ descExpanded ? "Show less" : "Read more" }}
                </button>
              </div>

              <!-- Neighbourhood stats card -->
              <div
                v-if="hasBuurtStats"
                class="mt-4 rounded-xl border border-black/6 bg-[#f0f0ee] px-4 py-3"
              >
                <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Neighbourhood<template v-if="listing.neighbourhood">
                    &middot; {{ listing.neighbourhood }}</template
                  >
                </div>
                <div class="flex flex-col gap-1.5 text-[13px]">
                  <div
                    v-if="listing.buurtWozValue != null"
                    class="flex justify-between text-[#555]"
                  >
                    <span class="text-[#999]">Avg. WOZ value</span>
                    <span>{{ formatPrice(listing.buurtWozValue) }}</span>
                  </div>
                  <div
                    v-if="listing.buurtOwnerOccupiedPct != null"
                    class="flex justify-between text-[#555]"
                  >
                    <span class="text-[#999]">Owner-occupied</span>
                    <span>{{ listing.buurtOwnerOccupiedPct }}%</span>
                  </div>
                  <div
                    v-if="listing.buurtSafetyRating != null"
                    class="flex justify-between text-[#555]"
                  >
                    <span class="text-[#999]">Safety rating</span>
                    <span>{{ listing.buurtSafetyRating }} / 10</span>
                  </div>
                  <div
                    v-if="listing.buurtCrimesPer1000 != null"
                    class="flex justify-between text-[#555]"
                  >
                    <span class="text-[#999]">Crimes per 1,000</span>
                    <span>{{ listing.buurtCrimesPer1000 }}</span>
                  </div>
                </div>
              </div>

              <!-- Collapsible note editor (at bottom) -->
              <div v-if="user" class="mt-4 border-t border-black/6 pt-4">
                <button
                  class="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-inherit text-[11px] font-semibold uppercase tracking-wide text-[#888] transition-colors hover:text-[#888]"
                  @click="noteEditorOpen = !noteEditorOpen"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="transition-transform"
                    :class="{ 'rotate-90': noteEditorOpen }"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {{ ownNote ? "Edit note" : "Add note" }}
                  <span v-if="noteSaving" class="ml-1 font-normal normal-case tracking-normal"
                    >saving...</span
                  >
                  <span
                    v-else-if="noteSaved"
                    class="ml-1 font-normal normal-case tracking-normal text-emerald-600"
                    >saved</span
                  >
                </button>
                <div v-if="noteEditorOpen" class="mt-2">
                  <textarea
                    v-model="ownNoteText"
                    rows="3"
                    class="w-full resize-none rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 font-inherit text-[13px] text-[#333] outline-none transition-colors placeholder:text-[#bbb] focus:border-black/20 focus:bg-white"
                    placeholder="Add a note..."
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { ReactionType } from "@ernest/shared";
import { useListingStore } from "@/composables/useListingStore";
import { useAuth } from "@/composables/useAuth";
import { flyTo } from "@/composables/useMapPosition";
import { OFFICES } from "@/geo/constants";
import PhotoGallery from "@/components/PhotoGallery.vue";

const { selectedListing, closeModal, dismissModal, setReaction, saveNote } = useListingStore();
const { user } = useAuth();

const listing = selectedListing;
const descExpanded = ref(false);
const showOriginalDesc = ref(false);
const modalRef = ref<HTMLDivElement>();
const ownNoteText = ref("");
const noteEditorOpen = ref(false);
const noteSaving = ref(false);
const noteSaved = ref(false);
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let savedFadeTimer: ReturnType<typeof setTimeout> | null = null;
let prevFundaId: string | null = null;

const overbidPrice = computed(() => {
  if (!listing.value) return 0;
  return Math.round(listing.value.price * 1.15);
});

const listingAgeDays = computed(() => {
  if (!listing.value?.offeredSince) return null;
  const offered = new Date(listing.value.offeredSince);
  if (Number.isNaN(offered.getTime())) return null;
  const diff = Date.now() - offered.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

const keyFacts = computed(() => {
  if (!listing.value) return "";
  const parts: string[] = [];
  if (listing.value.bedrooms) parts.push(`${listing.value.bedrooms} bed`);
  if (listing.value.livingArea) parts.push(`${listing.value.livingArea} m\u00B2`);
  if (listing.value.energyLabel) parts.push(`Label ${listing.value.energyLabel}`);
  if (listing.value.constructionYear) parts.push(`${listing.value.constructionYear}`);
  if (listing.value.hasGarden) parts.push("Garden");
  if (listing.value.hasBalcony) parts.push("Balcony");
  if (listing.value.hasRoofTerrace) parts.push("Roof terrace");
  return parts.join(" \u00B7 ");
});

const hasBuurtStats = computed(() => {
  if (!listing.value) return false;
  const l = listing.value;
  return (
    l.buurtWozValue != null ||
    l.buurtSafetyRating != null ||
    l.buurtCrimesPer1000 != null ||
    l.buurtOwnerOccupiedPct != null
  );
});

const activeDescription = computed(() => {
  if (!listing.value) return null;
  if (showOriginalDesc.value || !listing.value.aiDescription) {
    return listing.value.description;
  }
  return listing.value.aiDescription;
});

function formatPrice(price: number): string {
  return `\u20AC${price.toLocaleString("nl-NL")}`;
}

function close() {
  // Flush any pending auto-save before closing
  if (saveDebounceTimer && listing.value && user.value && ownNoteChanged.value) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
  }
  closeModal();
}

function showOnMap() {
  if (!listing.value) return;
  // Flush any pending auto-save
  if (saveDebounceTimer && user.value && ownNoteChanged.value) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
  }
  const { longitude, latitude } = listing.value;
  dismissModal();
  flyTo(longitude, latitude);
}

// Find own note and track if it changed
const ownNote = computed(() => {
  if (!listing.value || !user.value) return null;
  return listing.value.notes.find((n) => n.userId === user.value!.id) ?? null;
});

const ownNoteChanged = computed(() => {
  const original = ownNote.value?.text ?? "";
  return ownNoteText.value.trim() !== original;
});

function toggleReaction(reaction: ReactionType) {
  if (!listing.value || !user.value) return;
  const newReaction = listing.value.reaction === reaction ? null : reaction;
  setReaction(listing.value.fundaId, newReaction, user.value.username);
}

// Auto-save note on text change (debounced 1s)
watch(ownNoteText, () => {
  if (!listing.value || !user.value || !ownNoteChanged.value) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  if (savedFadeTimer) {
    clearTimeout(savedFadeTimer);
    savedFadeTimer = null;
  }
  noteSaved.value = false;

  saveDebounceTimer = setTimeout(async () => {
    saveDebounceTimer = null;
    if (!listing.value || !user.value || !ownNoteChanged.value) return;

    noteSaving.value = true;
    await saveNote(listing.value.fundaId, ownNoteText.value.trim(), {
      id: user.value.id,
      username: user.value.username,
    });
    noteSaving.value = false;
    noteSaved.value = true;
    savedFadeTimer = setTimeout(() => {
      noteSaved.value = false;
    }, 2000);
  }, 1000);
});

// Reset state only when switching to a different listing (not on data updates)
watch(
  listing,
  (v) => {
    const newId = v?.fundaId ?? null;
    if (newId === prevFundaId) return;
    prevFundaId = newId;

    descExpanded.value = false;
    showOriginalDesc.value = false;
    noteEditorOpen.value = false;
    noteSaving.value = false;
    noteSaved.value = false;
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    if (savedFadeTimer) {
      clearTimeout(savedFadeTimer);
      savedFadeTimer = null;
    }
    if (v && user.value) {
      const note = v.notes.find((n) => n.userId === user.value!.id);
      ownNoteText.value = note?.text ?? "";
      if (note) noteEditorOpen.value = true;
    } else {
      ownNoteText.value = "";
    }
  },
  { immediate: true },
);

// Focus trap + initial focus (only when modal opens, not on data updates)
watch(listing, (v, oldV) => {
  if (v && !oldV) {
    nextTick(() => {
      const first = modalRef.value?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      first?.focus();
    });
  }
});

// Global Escape key listener
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

watch(listing, (v) => {
  if (v) {
    window.addEventListener("keydown", onGlobalKeydown);
  } else {
    window.removeEventListener("keydown", onGlobalKeydown);
  }
});

// Lock body scroll when modal is open
watch(listing, (v) => {
  if (v) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

function trapFocus(e: KeyboardEvent) {
  if (e.key !== "Tab" || !modalRef.value) return;
  const focusable = modalRef.value.querySelectorAll<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.highlights-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f7f7f6;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
  font-size: 12px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reaction-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.reaction-btn--active {
  border-color: transparent;
}

.reaction-btn--fav {
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  border-color: rgba(192, 57, 43, 0.2);
}

.reaction-btn--fav:hover {
  background: rgba(192, 57, 43, 0.18);
}

.reaction-btn--discard {
  background: rgba(0, 0, 0, 0.06);
  color: #999;
  border-color: rgba(0, 0, 0, 0.1);
}

.reaction-btn--discard:hover {
  background: rgba(0, 0, 0, 0.1);
}

/* Slide-up on mobile, scale-fade on desktop */
.listing-modal-enter-active,
.listing-modal-leave-active {
  transition: opacity 0.25s ease;
}

.listing-modal-enter-active .listing-panel,
.listing-modal-leave-active .listing-panel {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}

.listing-modal-enter-from,
.listing-modal-leave-to {
  opacity: 0;
}

/* Mobile: slide up */
.listing-modal-enter-from .listing-panel,
.listing-modal-leave-to .listing-panel {
  transform: translateY(100%);
  opacity: 1;
}

/* Desktop: scale-fade */
@media (min-width: 640px) {
  .listing-modal-enter-from .listing-panel,
  .listing-modal-leave-to .listing-panel {
    transform: scale(0.96) translateY(8px);
    opacity: 0;
  }
}
</style>
