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
        <div v-if="loading" class="text-center text-[13px] text-[#888]">Loading...</div>
        <div v-else-if="error" class="text-center text-[13px] text-red-600">{{ error }}</div>
        <div v-else-if="events.length === 0" class="text-center text-[13px] text-[#888]">
          No activity yet.
        </div>

        <div v-else class="flex flex-col gap-6">
          <section v-for="group in groups" :key="group.label">
            <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              {{ group.label }}
            </div>
            <div class="overflow-hidden rounded-xl border border-black/6 bg-white">
              <router-link
                v-for="(event, idx) in group.events"
                :key="event.fundaId + event.type + event.at"
                :to="{ path: '/', query: { listing: event.fundaId } }"
                class="flex items-start gap-3 border-b border-black/5 px-4 py-3 no-underline last:border-0 transition-colors hover:bg-black/3"
                :class="{ 'border-b': idx < group.events.length - 1 }"
              >
                <div
                  class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[#eee] bg-cover bg-center"
                  :style="event.photo ? { backgroundImage: `url(${event.photo})` } : null"
                ></div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1.5 text-[13px] leading-snug">
                    <span class="font-semibold" :class="eventColor(event.type)">
                      {{ eventLabel(event) }}
                    </span>
                    <span class="text-[#aaa]">·</span>
                    <span class="text-[12px] text-[#888]">{{ formatTime(event.at) }}</span>
                  </div>
                  <div class="mt-0.5 truncate text-[13px] font-medium text-[#222]">
                    {{ event.address }}
                  </div>
                  <div class="text-[12px] text-[#888]">
                    <span v-if="event.city">{{ event.city }}</span>
                    <span v-if="event.city"> · </span>
                    <span>{{ formatPrice(event.price) }}</span>
                    <template v-if="event.type === 'viewing-scheduled'">
                      <span> · viewing {{ formatViewing(event.scheduledAt) }}</span>
                    </template>
                  </div>
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
import type { ActivityEvent } from "@ernest/shared";
import { fetchActivity } from "@/api/client";

const events = ref<ActivityEvent[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    events.value = await fetchActivity();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load activity";
  } finally {
    loading.value = false;
  }
});

function eventLabel(event: ActivityEvent): string {
  switch (event.type) {
    case "listed":
      return "New listing";
    case "favourited":
      return `${event.by} favourited`;
    case "viewing-scheduled":
      return `${event.by} scheduled a viewing`;
  }
}

function eventColor(type: ActivityEvent["type"]): string {
  switch (type) {
    case "listed":
      return "text-amber-700";
    case "favourited":
      return "text-rose-700";
    case "viewing-scheduled":
      return "text-emerald-700";
  }
}

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
  const map = new Map<string, { label: string; events: ActivityEvent[] }>();
  for (const event of events.value) {
    const key = dayKey(event.at);
    let group = map.get(key);
    if (!group) {
      group = { label: dayLabel(event.at), events: [] };
      map.set(key, group);
    }
    group.events.push(event);
  }
  return Array.from(map.values());
});
</script>
