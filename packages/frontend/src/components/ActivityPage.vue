<template>
  <div class="flex h-full flex-col bg-[#f5f5f5]">
    <header
      class="sticky top-0 z-10 flex items-center gap-3 border-b border-black/8 bg-white/80 px-5 py-4 backdrop-blur-lg"
    >
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

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-[640px] px-4 py-6">
        <div
          v-if="!loading && !error && items.length > 0"
          class="mb-4 flex flex-wrap items-center gap-1.5"
        >
          <button
            v-for="filter in filterDefs"
            :key="filter.key"
            class="filter-chip"
            :class="[`filter-chip--${filter.key}`, { 'filter-chip--off': !enabled[filter.key] }]"
            @click="toggle(filter.key)"
          >
            {{ filter.label }}
            <span class="filter-chip-count">{{ counts[filter.key] }}</span>
          </button>
        </div>

        <div v-if="loading" class="text-center text-[13px] text-[#888]">Loading...</div>
        <div v-else-if="error" class="text-center text-[13px] text-red-600">{{ error }}</div>
        <div v-else-if="items.length === 0" class="text-center text-[13px] text-[#888]">
          No listings yet.
        </div>
        <div v-else-if="filteredItems.length === 0" class="text-center text-[13px] text-[#888]">
          Nothing matches the current filters.
        </div>

        <div v-else class="flex flex-col gap-6">
          <section v-for="group in groups" :key="group.label">
            <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              {{ group.label }}
            </div>
            <div class="overflow-hidden rounded-xl border border-black/6 bg-white">
              <router-link
                v-for="item in group.items"
                :key="item.fundaId"
                :to="{ path: '/', query: { listing: item.fundaId } }"
                class="activity-row flex items-start gap-3 border-b border-black/5 px-4 py-3 no-underline last:border-0 transition-colors hover:bg-black/3"
                :class="{
                  'activity-row--favourited': item.reaction?.type === 'favourite',
                  'activity-row--discarded': item.reaction?.type === 'discarded',
                }"
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
                    <span>{{ formatPrice(estimatedPrice(item)) }}</span>
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
              </router-link>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ActivityListing } from "@ernest/shared";
import { getEstimatedClosingPrice } from "@ernest/shared";
import { fetchActivity } from "@/api/client";

const items = ref<ActivityListing[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

type FilterKey = "liked" | "discarded" | "viewing" | "untouched";

const filterDefs: { key: FilterKey; label: string }[] = [
  { key: "liked", label: "Liked" },
  { key: "discarded", label: "Discarded" },
  { key: "viewing", label: "Viewing" },
  { key: "untouched", label: "Untouched" },
];

const enabled = ref<Record<FilterKey, boolean>>({
  liked: true,
  discarded: true,
  viewing: true,
  untouched: true,
});

function toggle(key: FilterKey) {
  enabled.value = { ...enabled.value, [key]: !enabled.value[key] };
}

function categoriesOf(item: ActivityListing): FilterKey[] {
  const cats: FilterKey[] = [];
  if (item.reaction?.type === "favourite") cats.push("liked");
  if (item.reaction?.type === "discarded") cats.push("discarded");
  if (item.viewing) cats.push("viewing");
  if (cats.length === 0) cats.push("untouched");
  return cats;
}

const counts = computed(() => {
  const c: Record<FilterKey, number> = { liked: 0, discarded: 0, viewing: 0, untouched: 0 };
  for (const item of items.value) {
    for (const cat of categoriesOf(item)) c[cat]++;
  }
  return c;
});

const filteredItems = computed(() =>
  items.value.filter((item) => categoriesOf(item).some((c) => enabled.value[c])),
);

onMounted(async () => {
  try {
    items.value = await fetchActivity();
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

function estimatedPrice(item: ActivityListing): number {
  return getEstimatedClosingPrice(item.price, item.url) ?? item.price;
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

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}

.filter-chip-count {
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}

.filter-chip--liked {
  background: rgba(244, 63, 94, 0.1);
  color: #be123c;
}

.filter-chip--discarded {
  background: rgba(0, 0, 0, 0.05);
  color: #555;
}

.filter-chip--viewing {
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
}

.filter-chip--untouched {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.filter-chip--off {
  background: transparent !important;
  color: #aaa !important;
  border-color: rgba(0, 0, 0, 0.1);
}

.filter-chip--off .filter-chip-count {
  background: rgba(0, 0, 0, 0.04);
  color: #bbb;
}
</style>
