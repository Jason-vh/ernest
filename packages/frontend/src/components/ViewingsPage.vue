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
      <h1 class="text-[17px] font-semibold text-[#333]">Upcoming viewings</h1>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-[640px] px-4 py-6">
        <div v-if="loading" class="text-center text-[13px] text-[#888]">Loading...</div>
        <div v-else-if="error" class="text-center text-[13px] text-red-600">{{ error }}</div>
        <div v-else-if="items.length === 0" class="text-center text-[13px] text-[#888]">
          No upcoming viewings.
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
                class="flex items-start gap-3 border-b border-black/5 px-4 py-3 no-underline last:border-0 transition-colors hover:bg-black/3"
              >
                <div class="flex w-12 flex-shrink-0 flex-col items-center justify-center">
                  <div class="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    {{ formatDay(item.scheduledAt) }}
                  </div>
                  <div class="text-[18px] font-bold leading-none text-[#222]">
                    {{ formatTime(item.scheduledAt) }}
                  </div>
                </div>
                <div
                  class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[#eee] bg-cover bg-center"
                  :style="item.photo ? { backgroundImage: `url(${item.photo})` } : null"
                ></div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-semibold text-[#222]">
                    {{ item.address }}
                  </div>
                  <div class="mt-0.5 truncate text-[12px] text-[#888]">
                    <span v-if="item.city">{{ item.city }}</span>
                    <span v-if="item.city"> &middot; </span>
                    <span>{{ formatPrice(item.price) }}/mo</span>
                  </div>
                  <div class="mt-1 truncate text-[11px] text-[#888]">
                    scheduled by {{ item.scheduledBy }}
                  </div>
                  <p
                    v-if="item.note"
                    class="m-0 mt-1.5 whitespace-pre-line text-[12px] leading-[1.5] text-[#555]"
                  >
                    {{ item.note }}
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
import type { UpcomingViewing } from "@ernest/shared";
import { fetchUpcomingViewings } from "@/api/client";

const items = ref<UpcomingViewing[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = await fetchUpcomingViewings();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load viewings";
  } finally {
    loading.value = false;
  }
});

const dayBadgeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dayBadgeFormatter.format(d);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return timeFormatter.format(d);
}

function formatPrice(price: number): string {
  return `€${price.toLocaleString("nl-NL")}`;
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
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (dayKey(d.toISOString()) === dayKey(today.toISOString())) return "Today";
  if (dayKey(d.toISOString()) === dayKey(tomorrow.toISOString())) return "Tomorrow";
  return groupLabelFormatter.format(d);
}

const groups = computed(() => {
  const map = new Map<string, { label: string; items: UpcomingViewing[] }>();
  for (const item of items.value) {
    const key = dayKey(item.scheduledAt);
    let group = map.get(key);
    if (!group) {
      group = { label: dayLabel(item.scheduledAt), items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
});
</script>
