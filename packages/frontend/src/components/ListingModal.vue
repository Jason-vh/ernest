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
          class="listing-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[14px] bg-white/90 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-[24px] sm:max-w-[480px] sm:rounded-[14px]"
          @keydown="trapFocus"
        >
          <!-- Scrollable content -->
          <div class="flex-1 overflow-y-auto overscroll-contain">
            <!-- Photo gallery with floating close button -->
            <div v-if="listing.photos.length > 0" class="relative">
              <PhotoGallery :photos="listing.photos" />
              <!-- Floating close over photos -->
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
            <div v-else class="flex items-center justify-end px-4 pt-3">
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
              <!-- Address + status -->
              <div>
                <div class="flex items-center justify-between gap-2">
                  <h2 class="m-0 text-[17px] font-semibold leading-tight text-[#1a1a1a]">
                    {{ listing.address }}
                  </h2>
                  <a
                    :href="listing.url"
                    target="_blank"
                    rel="noopener"
                    class="flex-shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 no-underline transition-colors hover:bg-emerald-500/20"
                    >Available on Funda &rarr;</a
                  >
                </div>
                <p v-if="listing.neighbourhood" class="m-0 mt-1 text-[13px] text-[#888]">
                  {{ listing.neighbourhood
                  }}<span v-if="listing.postcode"> &middot; {{ listing.postcode }}</span>
                </p>
              </div>

              <!-- Price block -->
              <div class="mt-4">
                <div class="text-[26px] font-bold tracking-[-0.02em] text-[#1a1a1a]">
                  {{ formatPrice(overbidPrice) }}
                </div>
                <div class="mt-0.5 text-[12px] text-[#999]">
                  based on 15% overbid on {{ formatPrice(listing.price) }}
                </div>
              </div>

              <!-- Divider -->
              <div class="my-4 h-px bg-black/6"></div>

              <!-- Key features (chip grid) -->
              <div class="flex flex-wrap gap-[6px]">
                <span v-if="listing.bedrooms" class="chip">{{ listing.bedrooms }} beds</span>
                <span v-if="listing.livingArea" class="chip">{{ listing.livingArea }} m&sup2;</span>
                <span v-if="listing.energyLabel" class="chip">Label {{ listing.energyLabel }}</span>
                <span v-if="listing.constructionYear" class="chip">{{
                  listing.constructionYear
                }}</span>
                <span v-if="listing.hasGarden" class="chip chip--badge">Garden</span>
                <span v-if="listing.hasBalcony" class="chip chip--badge">Balcony</span>
                <span v-if="listing.hasRoofTerrace" class="chip chip--badge">Roof terrace</span>
              </div>

              <!-- Cycling times card -->
              <div
                v-if="listing.routeFareharbor || listing.routeAirwallex"
                class="mt-4 flex flex-col gap-2 rounded-[10px] bg-black/[0.03] p-3.5"
              >
                <div class="text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">
                  Cycling
                </div>
                <div class="flex flex-col gap-1.5">
                  <div v-if="listing.routeFareharbor" class="flex items-center gap-2.5 text-[13px]">
                    <span
                      class="inline-block h-[7px] w-[7px] rounded-full"
                      :style="{ background: COLORS.routeFareharbor }"
                    ></span>
                    <span
                      :style="{ color: COLORS.routeFareharbor }"
                      class="font-semibold tabular-nums"
                      >{{ listing.routeFareharbor.duration }} min</span
                    >
                    <span class="text-[#888]">to {{ OFFICES.fareharbor.name }}</span>
                  </div>
                  <div v-if="listing.routeAirwallex" class="flex items-center gap-2.5 text-[13px]">
                    <span
                      class="inline-block h-[7px] w-[7px] rounded-full"
                      :style="{ background: COLORS.routeAirwallex }"
                    ></span>
                    <span
                      :style="{ color: COLORS.routeAirwallex }"
                      class="font-semibold tabular-nums"
                      >{{ listing.routeAirwallex.duration }} min</span
                    >
                    <span class="text-[#888]">to {{ OFFICES.airwallex.name }}</span>
                  </div>
                </div>
              </div>

              <!-- Offered since -->
              <div v-if="listing.offeredSince" class="mt-4 text-[12px] text-[#aaa]">
                Listed since {{ listing.offeredSince }}
              </div>

              <!-- Description -->
              <div v-if="listing.description" class="mt-4">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-[#aaa]">
                  Description
                </div>
                <p
                  class="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.6] text-[#555]"
                  :class="{ 'line-clamp-6': !descExpanded }"
                >
                  {{ listing.description }}
                </p>
                <button
                  v-if="listing.description.length > 300"
                  class="mt-1.5 cursor-pointer border-none bg-transparent p-0 font-inherit text-[12px] font-medium text-[#999] underline decoration-[#ddd] underline-offset-2 transition-colors hover:text-[#666] hover:decoration-[#aaa]"
                  @click="descExpanded = !descExpanded"
                >
                  {{ descExpanded ? "Show less" : "Read more" }}
                </button>
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
import { useListingStore } from "@/composables/useListingStore";
import { OFFICES, COLORS } from "@/geo/constants";
import PhotoGallery from "@/components/PhotoGallery.vue";

const { selectedListing, closeModal } = useListingStore();

const listing = selectedListing;
const descExpanded = ref(false);
const modalRef = ref<HTMLDivElement>();

const overbidPrice = computed(() => {
  if (!listing.value) return 0;
  return Math.round(listing.value.price * 1.15);
});

function formatPrice(price: number): string {
  return `\u20AC${price.toLocaleString("nl-NL")}`;
}

function close() {
  closeModal();
}

// Reset description expansion when listing changes
watch(listing, () => {
  descExpanded.value = false;
});

// Focus trap + initial focus
watch(listing, (v) => {
  if (v) {
    nextTick(() => {
      const first = modalRef.value?.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      first?.focus();
    });
  }
});

// Global Escape key listener — works regardless of focus location
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
.chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 12px;
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.chip--badge {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.15);
  color: #2d8a4e;
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
