<template>
  <Teleport to="body">
    <Transition name="listing-modal">
      <div
        v-if="listing"
        class="fixed inset-0 z-100 flex flex-col items-center justify-end bg-black/20 backdrop-blur-[6px] sm:justify-center"
        @click.self="close"
      >
        <!-- Cluster nav above modal -->
        <div v-if="isCluster" class="mb-2 flex items-center gap-3" @click.stop>
          <button
            class="cluster-arrow flex sm:hidden"
            title="Previous listing (←)"
            @click="navigateCluster(-1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span
            class="rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium tabular-nums text-white/90 backdrop-blur-sm"
          >
            {{ currentClusterIndex + 1 }} / {{ clusterListingIds.length }}
          </span>
          <button
            class="cluster-arrow flex sm:hidden"
            title="Next listing (→)"
            @click="navigateCluster(1)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <!-- Row: optional prev arrow + modal + optional next arrow -->
        <div class="flex w-full items-center justify-center gap-3" @click.self="close">
          <!-- Prev arrow (desktop only) -->
          <button
            v-if="isCluster"
            class="cluster-arrow hidden flex-shrink-0 sm:flex"
            title="Previous listing (←)"
            @click="navigateCluster(-1)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-label="Listing details"
            tabindex="-1"
            class="listing-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white/90 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.08)] outline-none backdrop-blur-[24px] sm:max-h-[calc(100dvh-6rem)] sm:max-w-[580px] sm:rounded-[14px]"
            @keydown="trapFocus"
          >
            <!-- Scrollable content -->
            <div ref="scrollContainerRef" class="flex-1 overflow-y-auto overscroll-none">
              <!-- Photo gallery -->
              <div v-if="listing.photos.length > 0" class="relative">
                <!-- Floating top bar (zero-height sticky overlay, no layout impact) -->
                <div
                  class="pointer-events-none sticky top-0 z-20 flex h-0 items-start justify-end gap-1.5 overflow-visible px-2.5"
                >
                  <div class="flex gap-1.5 pt-2.5">
                    <button
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
                      title="Copy link"
                      @click="copyLink"
                    >
                      <Transition name="icon-swap" mode="out-in">
                        <svg
                          v-if="!linkCopied"
                          key="link"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        <svg
                          v-else
                          key="check"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </Transition>
                    </button>
                    <button
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
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
                      class="pointer-events-auto relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/55"
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
                </div>
                <PhotoGallery
                  :photos="listing.photos"
                  :initial-fullscreen-index="initialPhotoIndex"
                  @fullscreen-change="onFullscreenChange"
                />
              </div>

              <!-- Top bar fallback when no photos -->
              <div v-else class="flex items-center justify-end gap-1.5 px-2.5 pt-2.5 pb-1.5">
                <button
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
                  title="Copy link"
                  @click="copyLink"
                >
                  <Transition name="icon-swap" mode="out-in">
                    <svg
                      v-if="!linkCopied"
                      key="link"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <svg
                      v-else
                      key="check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </Transition>
                </button>
                <button
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
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
                  class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/10 text-[#666] transition-colors hover:bg-black/15"
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
                      asking {{ formatPrice(listing.price) }}
                    </div>
                  </div>
                </div>

                <!-- Key facts (inline) with status + energy + ownership badges -->
                <div
                  v-if="keyFacts || energyLabelBadge || ownershipBadge"
                  class="mt-2.5 text-[13px] text-[#666]"
                >
                  <span
                    v-if="listing.status === 'Beschikbaar'"
                    class="mr-1.5 inline-block rounded bg-emerald-500/10 px-1.5 py-[1px] text-[11px] font-semibold text-emerald-700"
                    >Available</span
                  ><span
                    v-if="energyLabelBadge"
                    class="mr-1.5 inline-block rounded px-1.5 py-[1px] text-[11px] font-semibold"
                    :class="energyLabelBadge.cls"
                    >{{ energyLabelBadge.text }}</span
                  ><span
                    v-if="ownershipBadge"
                    class="mr-1.5 inline-block rounded px-1.5 py-[1px] text-[11px] font-semibold"
                    :class="ownershipBadge.cls"
                    >{{ ownershipBadge.text }}</span
                  >{{ keyFacts }}
                </div>

                <!-- Cycling commute -->
                <div v-if="commuteEntries.length" class="mt-1.5 text-[12px] text-[#aaa]">
                  <template v-for="(entry, i) in commuteEntries" :key="entry.label">
                    <template v-if="i > 0"> &middot; </template>
                    <span class="tabular-nums text-[#888]">{{ entry.mins }} min</span>
                    {{ entry.first ? "cycle to" : "to" }} {{ entry.label }}
                  </template>
                </div>

                <!-- Actions row + integrated note (logged-in users) -->
                <div v-if="user" class="mt-3">
                  <div class="flex items-center gap-2">
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
                      {{ listing.reaction === "favourite" ? "Favourited" : "Favourite" }}
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
                      {{ listing.reaction === "discarded" ? "Discarded" : "Discard" }}
                    </button>
                    <span
                      v-if="listing.reactionBy"
                      class="ml-auto self-center text-[11px] text-[#bbb]"
                    >
                      by {{ listing.reactionBy }}
                    </span>
                  </div>

                  <!-- Inline note editor (shows after reacting or when note exists) -->
                  <div v-if="noteEditorOpen" class="note-editor mt-2.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[11px] font-medium text-[#999]">
                        {{ ownNote ? "Your note" : "Add a note" }}
                      </span>
                      <span v-if="noteSaving" class="text-[11px] font-normal text-[#bbb]"
                        >saving...</span
                      >
                      <span v-else-if="noteSaved" class="text-[11px] font-normal text-emerald-600"
                        >saved</span
                      >
                    </div>
                    <textarea
                      v-model="ownNoteText"
                      rows="2"
                      class="mt-1 w-full resize-none rounded-lg border border-black/10 bg-white/80 px-3 py-2 font-inherit text-[13px] text-[#333] outline-none transition-colors placeholder:text-[#bbb] focus:border-black/20 focus:bg-white"
                      placeholder="Why do you like or dislike this place?"
                    ></textarea>
                  </div>
                </div>

                <!-- Read-only reaction display (logged-out users) -->
                <div
                  v-else-if="listing.reaction && listing.reactionBy"
                  class="mt-3 flex items-center gap-1.5 text-[12px] text-[#999]"
                >
                  <svg
                    v-if="listing.reaction === 'favourite'"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#c0392b"
                    stroke-width="2"
                  >
                    <path
                      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                      fill="#c0392b"
                    />
                  </svg>
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#b91c1c"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  <span>
                    {{ listing.reaction === "favourite" ? "Favourited" : "Discarded" }} by
                    {{ listing.reactionBy }}
                  </span>
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

                <!-- Notes (read-only display) -->
                <div v-if="otherNotes.length > 0" class="mt-4">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                    Notes
                  </div>
                  <div v-for="note in otherNotes" :key="note.userId" class="notes-card mt-2">
                    <div class="text-[11px] font-semibold text-[#999]">{{ note.username }}</div>
                    <p class="m-0 mt-1 whitespace-pre-line text-[13px] leading-[1.5] text-[#444]">
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
                    :class="{
                      'line-clamp-6': !descExpanded && (showOriginalDesc || !listing.aiDescription),
                    }"
                  >
                    {{ activeDescription }}
                  </p>
                  <button
                    v-if="
                      activeDescription.length > 300 && (showOriginalDesc || !listing.aiDescription)
                    "
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

                <!-- Location mini map -->
                <ListingMiniMap :longitude="listing.longitude" :latitude="listing.latitude" />

                <!-- Add note link (shown when logged in, no reaction yet, and editor not open) -->
                <div
                  v-if="user && !listing.reaction && !noteEditorOpen"
                  class="mt-4 border-t border-black/6 pt-4"
                >
                  <button
                    class="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-inherit text-[11px] font-semibold uppercase tracking-wide text-[#888] transition-colors hover:text-[#666]"
                    @click="noteEditorOpen = true"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add note
                  </button>
                </div>
                <!-- View on Funda -->
                <div class="mt-4 border-t border-black/6 pt-4">
                  <a
                    :href="listing.url"
                    target="_blank"
                    rel="noopener"
                    class="flex w-full items-center justify-center rounded-lg bg-black/5 py-2.5 no-underline transition-colors hover:bg-black/10"
                  >
                    <img :src="fundaLogo" alt="View on Funda" class="h-[16px]" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Next arrow (desktop only) -->
          <button
            v-if="isCluster"
            class="cluster-arrow hidden flex-shrink-0 sm:flex"
            title="Next listing (→)"
            @click="navigateCluster(1)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
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
import ListingMiniMap from "@/components/ListingMiniMap.vue";
import fundaLogo from "@/assets/funda.svg";

const {
  selectedListing,
  closeModal,
  dismissModal,
  setReaction,
  saveNote,
  clusterListingIds,
  currentClusterIndex,
  navigateCluster,
} = useListingStore();
const { user } = useAuth();

const listing = selectedListing;
const isCluster = computed(() => clusterListingIds.value.length > 1);
const photoFullscreenOpen = ref(false);
const initialPhotoIndex = ref<number | undefined>();
const descExpanded = ref(false);
const showOriginalDesc = ref(false);
const modalRef = ref<HTMLDivElement>();
const ownNoteText = ref("");
const noteEditorOpen = ref(false);
const noteSaving = ref(false);
const noteSaved = ref(false);
const scrollContainerRef = ref<HTMLDivElement>();
const linkCopied = ref(false);
let linkCopiedTimer: ReturnType<typeof setTimeout> | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let savedFadeTimer: ReturnType<typeof setTimeout> | null = null;
let prevFundaId: string | null = null;

const overbidPrice = computed(() => {
  if (!listing.value) return 0;
  return Math.round(listing.value.price * 1.15);
});

const listingAgeText = computed(() => {
  if (!listing.value?.offeredSince) return null;
  const offered = new Date(listing.value.offeredSince);
  if (Number.isNaN(offered.getTime())) return null;
  const days = Math.floor((Date.now() - offered.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "listed today";
  if (days < 14) return `listed ${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `listed ${Math.round(days / 7)} weeks ago`;
  return `listed ${Math.round(days / 30)} months ago`;
});

const keyFacts = computed(() => {
  if (!listing.value) return "";
  const parts: string[] = [];
  if (listing.value.bedrooms) parts.push(`${listing.value.bedrooms} beds`);
  if (listing.value.livingArea) parts.push(`${listing.value.livingArea} m\u00B2`);
  if (listing.value.constructionYear) parts.push(`${listing.value.constructionYear}`);
  if (listing.value.hasGarden) parts.push("Garden");
  if (listing.value.hasBalcony) parts.push("Balcony");
  if (listing.value.hasRoofTerrace) parts.push("Roof terrace");
  if (listingAgeText.value) parts.push(listingAgeText.value);
  return parts.join(" \u00B7 ");
});

const commuteEntries = computed(() => {
  if (!listing.value) return [];
  const entries: { mins: number; label: string; first: boolean }[] = [];
  if (listing.value.routeFareharbor)
    entries.push({
      mins: listing.value.routeFareharbor,
      label: OFFICES.fareharbor.name,
      first: false,
    });
  if (listing.value.routeAirwallex)
    entries.push({
      mins: listing.value.routeAirwallex,
      label: OFFICES.airwallex.name,
      first: false,
    });
  if (entries.length === 2 && parseInt(listing.value.fundaId, 10) % 2 === 1) entries.reverse();
  if (entries.length > 0) entries[0].first = true;
  return entries;
});

const energyLabelBadge = computed(() => {
  if (!listing.value) return null;
  const label = listing.value.energyLabel;
  if (!label || label.toLowerCase() === "unknown")
    return { text: "No energy label", cls: "bg-red-500/10 text-red-700" };
  if (label === "D") return { text: `Label ${label}`, cls: "bg-amber-500/10 text-amber-700" };
  return { text: `Label ${label}`, cls: "bg-emerald-500/10 text-emerald-700" };
});

const ownershipBadge = computed(() => {
  if (!listing.value) return null;
  const ownership = listing.value.ownership;
  if (!ownership) return null;
  const isErfpacht = ownership.toLowerCase().includes("erfpacht");
  if (isErfpacht) return { text: ownership, cls: "bg-amber-500/10 text-amber-700" };
  return { text: ownership, cls: "bg-black/5 text-[#666]" };
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

function copyLink() {
  navigator.clipboard.writeText(window.location.href);
  linkCopied.value = true;
  if (linkCopiedTimer) clearTimeout(linkCopiedTimer);
  linkCopiedTimer = setTimeout(() => {
    linkCopied.value = false;
  }, 2000);
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

function onFullscreenChange(index: number | null) {
  photoFullscreenOpen.value = index != null;
  const params = new URLSearchParams(window.location.search);
  if (index != null) {
    params.set("photo", String(index));
  } else {
    params.delete("photo");
  }
  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  history.replaceState(null, "", url);
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

// Notes from other users (own note is shown in the inline editor)
const otherNotes = computed(() => {
  if (!listing.value) return [];
  if (!user.value) return listing.value.notes;
  return listing.value.notes.filter((n) => n.userId !== user.value!.id);
});

function toggleReaction(reaction: ReactionType) {
  if (!listing.value || !user.value) return;
  const newReaction = listing.value.reaction === reaction ? null : reaction;
  setReaction(listing.value.fundaId, newReaction, user.value.username);
  // Auto-open the note editor when setting a reaction (not when clearing)
  if (newReaction) {
    noteEditorOpen.value = true;
  }
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

    // Scroll inner content back to top when switching listings
    scrollContainerRef.value?.scrollTo({ top: 0 });

    // Read photo deep-link param
    const photoParam = new URLSearchParams(window.location.search).get("photo");
    if (v && photoParam != null) {
      const idx = parseInt(photoParam, 10);
      initialPhotoIndex.value =
        !Number.isNaN(idx) && idx >= 0 && idx < v.photos.length ? idx : undefined;
    } else {
      initialPhotoIndex.value = undefined;
    }
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
      // Show note editor if user has a note or already reacted
      if (note || v.reaction) noteEditorOpen.value = true;
    } else {
      ownNoteText.value = "";
    }
  },
  { immediate: true },
);

// Focus the modal panel itself when it opens (keeps focus trap working without
// showing a visible focus ring on the first button/image)
watch(listing, (v, oldV) => {
  if (v && !oldV) {
    nextTick(() => {
      modalRef.value?.focus();
    });
  }
});

// Global keyboard listener (Escape to close, Left/Right for cluster nav)
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  if (isCluster.value && !photoFullscreenOpen.value) {
    if (e.key === "ArrowLeft") navigateCluster(-1);
    if (e.key === "ArrowRight") navigateCluster(1);
  }
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

.notes-card {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.12);
}

.note-editor {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.12);
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
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.18);
}

.reaction-btn--discard:hover {
  background: rgba(220, 38, 38, 0.14);
}

.cluster-arrow {
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.cluster-arrow:hover {
  background: rgba(0, 0, 0, 0.6);
}

.icon-swap-enter-active,
.icon-swap-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.icon-swap-enter-from {
  opacity: 0;
  transform: scale(0.4);
}

.icon-swap-leave-to {
  opacity: 0;
  transform: scale(0.4);
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
