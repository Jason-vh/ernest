<template>
  <div class="h-full overflow-y-auto bg-[#f5f5f5]">
    <header class="flex items-center gap-3 border-b border-black/8 bg-white px-5 py-4">
      <router-link
        to="/"
        class="flex h-8 w-8 items-center justify-center rounded-full text-[#666] no-underline transition-colors hover:bg-black/5"
        aria-label="Back to map"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </router-link>
      <h1 class="text-[17px] font-semibold text-[#333]">Activity</h1>
    </header>

    <div
      v-if="!loading && !error && items.length > 0"
      class="border-b border-black/8 bg-white px-4 py-3"
    >
      <div class="mx-auto flex w-full max-w-[640px] items-center gap-2">
        <div class="relative flex-1">
          <svg
            class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#999]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            v-model="searchQuery"
            type="search"
            inputmode="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search"
            class="block h-10 w-full rounded-full border border-black/10 bg-white pl-9 pr-9 text-[16px] text-[#222] outline-none transition-colors focus:border-black/25"
          />
          <button
            v-if="searchQuery"
            class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#aaa] transition-colors hover:bg-black/5 hover:text-[#666]"
            aria-label="Clear search"
            @click="searchQuery = ''"
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
        <div class="relative flex-shrink-0">
          <select
            v-model="stateFilter"
            class="state-select h-10 cursor-pointer appearance-none rounded-full border border-black/10 bg-white pl-4 pr-8 text-[16px] font-medium text-[#222] outline-none transition-colors focus:border-black/25"
          >
            <option v-for="opt in stateOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <svg
            class="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-[#777]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>

    <div>
      <div class="mx-auto w-full max-w-[640px] px-4 py-6">
        <div v-if="loading" class="text-center text-[13px] text-[#888]">Loading...</div>
        <div v-else-if="error" class="text-center text-[13px] text-red-600">{{ error }}</div>
        <div v-else-if="items.length === 0" class="text-center text-[13px] text-[#888]">
          No listings yet.
        </div>
        <div v-else-if="filteredItems.length === 0" class="text-center text-[13px] text-[#888]">
          Nothing matches.
        </div>

        <div v-else class="flex flex-col gap-6">
          <section v-for="group in groups" :key="group.label">
            <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              {{ group.label }}
            </div>
            <div class="overflow-hidden rounded-xl border border-black/6 bg-white">
              <button
                v-for="item in group.items"
                :key="item.fundaId"
                type="button"
                class="activity-row flex w-full items-start gap-3 border-0 border-b border-black/5 bg-transparent px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-black/3"
                :class="{
                  'activity-row--favourited': item.reaction?.type === 'favourite',
                  'activity-row--discarded': item.reaction?.type === 'discarded',
                }"
                @click="selectListing(item.fundaId)"
              >
                <div
                  class="activity-photo h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[#eee] bg-cover bg-center"
                  :style="item.photo ? { backgroundImage: `url(${item.photo})` } : null"
                ></div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2 text-[13px] leading-snug">
                    <span class="activity-address truncate font-semibold">{{ item.address }}</span>
                    <span class="flex-shrink-0 text-[11px] text-[#999]">{{
                      formatTime(item.lastActivityAt)
                    }}</span>
                  </div>
                  <div class="mt-0.5 truncate text-[12px] text-[#888]">
                    <span v-if="item.city">{{ item.city }}</span>
                    <span v-if="item.city"> &middot; </span>
                    <span>{{ formatPrice(item.price) }}/mo</span>
                    <span v-if="item.lastActivityAt !== item.createdAt">
                      &middot; added {{ formatRelative(item.createdAt) }}
                    </span>
                  </div>
                  <div
                    v-if="item.reaction || item.viewing"
                    class="mt-1.5 flex flex-wrap items-center gap-1.5"
                  >
                    <span
                      v-if="item.reaction?.type === 'favourite'"
                      class="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                        />
                      </svg>
                      {{ item.reaction.by }}
                    </span>
                    <span
                      v-else-if="item.reaction?.type === 'discarded'"
                      class="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-[#777]"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      {{ item.reaction.by }}
                    </span>
                    <span
                      v-if="item.viewing"
                      class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      {{ formatViewing(item.viewing.scheduledAt) }}
                    </span>
                  </div>
                  <p
                    v-if="item.reaction?.note"
                    class="m-0 mt-1.5 line-clamp-3 text-[12px] leading-snug whitespace-pre-line text-[#555]"
                  >
                    {{ item.reaction.note }}
                  </p>
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import type { ActivityListing } from "@ernest/shared";
import { fetchActivity, type ActivityStateFilter } from "@/api/client";
import { useListingStore } from "@/composables/useListingStore";

const { selectListing } = useListingStore();

const STATE_STORAGE_KEY = "ernest:activityState";

const items = ref<ActivityListing[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

type StateFilter = ActivityStateFilter;

const stateOptions: { value: StateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "liked", label: "Liked" },
  { value: "viewing", label: "Viewing" },
  { value: "untouched", label: "Untouched" },
  { value: "discarded", label: "Discarded" },
];

function readState(): StateFilter {
  const raw = localStorage.getItem(STATE_STORAGE_KEY);
  if (raw && ["all", "liked", "discarded", "viewing", "untouched"].includes(raw)) {
    return raw as StateFilter;
  }
  return "all";
}

const stateFilter = ref<StateFilter>(readState());
const searchQuery = ref("");

const filteredItems = computed(() => items.value);

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

async function reload(query: string, state: StateFilter) {
  loading.value = true;
  try {
    items.value = await fetchActivity(query, state);
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load activity";
  } finally {
    loading.value = false;
  }
}

watch(searchQuery, (val) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    void reload(val, stateFilter.value);
  }, 250);
});

watch(stateFilter, (val) => {
  localStorage.setItem(STATE_STORAGE_KEY, val);
  if (searchDebounce) clearTimeout(searchDebounce);
  void reload(searchQuery.value, val);
});

onMounted(async () => {
  try {
    items.value = await fetchActivity(searchQuery.value, stateFilter.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load activity";
  } finally {
    loading.value = false;
  }
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const viewingFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return timeFormatter.format(d);
}

function formatViewing(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return viewingFormatter.format(d);
}

function formatPrice(price: number): string {
  return `€${price.toLocaleString("nl-NL")}`;
}

const relativeDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return relativeDateFormatter.format(d);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const groupLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(d.toISOString()) === dayKey(today.toISOString())) return "Today";
  if (dayKey(d.toISOString()) === dayKey(yesterday.toISOString())) return "Yesterday";
  return groupLabelFormatter.format(d);
}

const groups = computed(() => {
  const map = new Map<string, { label: string; items: ActivityListing[] }>();
  for (const item of filteredItems.value) {
    const key = dayKey(item.lastActivityAt);
    let group = map.get(key);
    if (!group) {
      group = { label: dayLabel(item.lastActivityAt), items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
});
</script>

<style scoped>
.activity-row {
  position: relative;
}

.activity-address {
  color: #222;
}

/* Favourited: warm tint, accent stripe, bolder text */
.activity-row--favourited {
  background: linear-gradient(to right, rgba(244, 63, 94, 0.05), transparent 40%);
}

.activity-row--favourited::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #f43f5e;
}

.activity-row--favourited .activity-address {
  color: #111;
  font-weight: 700;
}

/* Discarded: greyscale photo, muted text */
.activity-row--discarded {
  opacity: 0.5;
}

.activity-row--discarded .activity-photo {
  filter: grayscale(1);
}

.activity-row--discarded .activity-address {
  color: #888;
  text-decoration: line-through;
  text-decoration-color: rgba(0, 0, 0, 0.3);
}

.activity-row--discarded:hover {
  opacity: 0.75;
}

.state-select {
  /* Min width so the chevron always has room */
  min-width: 7.5rem;
}
</style>
