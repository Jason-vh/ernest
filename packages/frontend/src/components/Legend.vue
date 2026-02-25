<template>
  <div class="glass absolute bottom-3 left-3 z-1 min-w-40 font-sans text-[13px]">
    <button
      class="flex w-full cursor-pointer items-center justify-between px-4 py-2.5"
      :class="collapsed ? '' : 'pb-1'"
      @click="collapsed = !collapsed"
    >
      <span class="text-[11px] font-semibold uppercase tracking-wide text-[#999]">Legend</span>
      <svg
        class="h-3 w-3 text-[#999] transition-transform duration-200"
        :class="collapsed ? '' : 'rotate-180'"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 4.5l3 3 3-3" />
      </svg>
    </button>

    <div v-show="!collapsed" class="flex flex-col gap-[5px] px-4 pb-3">
      <div class="flex flex-col gap-[5px]">
        <button
          v-for="item in zones"
          :key="item.key"
          :aria-pressed="zoneVisibility[item.key]"
          class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
          @click="toggleZone(item.key)"
        >
          <span
            class="h-3 w-5 shrink-0 rounded-sm border-[1.5px] transition-all duration-200"
            :class="zoneVisibility[item.key] ? '' : 'scale-75 opacity-25'"
            :style="{
              backgroundColor: item.color + '40',
              borderColor: item.color + '99',
            }"
          ></span>
          <span
            class="font-[450] transition-opacity"
            :class="
              zoneVisibility[item.key] ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'
            "
            >{{ item.label }}</span
          >
        </button>
      </div>
      <div class="my-0.5 h-px bg-[#e5e5e5]"></div>
      <div class="flex flex-col gap-[5px]">
        <button
          v-for="item in transit"
          :key="item.key"
          :aria-pressed="transitVisibility[item.key]"
          class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
          @click="toggleTransit(item.key)"
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/90 shadow-sm transition-all duration-200"
            :class="transitVisibility[item.key] ? '' : 'scale-75 opacity-12'"
            :style="{ backgroundColor: item.color }"
          ></span>
          <span
            class="font-[450] transition-opacity"
            :class="
              transitVisibility[item.key] ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'
            "
            >{{ item.label }}</span
          >
        </button>
      </div>
      <div class="my-0.5 h-px bg-[#e5e5e5]"></div>
      <div class="flex flex-col gap-[5px]">
        <button
          v-for="item in fundaItems"
          :key="item.key"
          :aria-pressed="item.visible"
          class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
          @click="item.toggle()"
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/90 shadow-sm transition-all duration-200"
            :class="item.visible ? '' : 'scale-75 opacity-12'"
            :style="{ backgroundColor: item.color }"
          ></span>
          <span
            class="font-[450] transition-opacity"
            :class="item.visible ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'"
            >{{ item.label }}</span
          >
          <span
            class="ml-auto text-[11px] tabular-nums transition-opacity"
            :class="item.visible ? 'text-[#aaa]' : 'text-[#aaa] opacity-35'"
            >{{ item.count }}</span
          >
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useZoneState, type ZoneKey, type TransitKey } from "@/composables/useZoneState";
import { COLORS } from "@/geo/constants";

// Collapsed state: default collapsed on small screens, expanded on desktop
const STORAGE_KEY = "ernest:legend-collapsed";
const stored = localStorage.getItem(STORAGE_KEY);
const isSmallScreen = window.matchMedia("(max-width: 640px)").matches;
const collapsed = ref(stored !== null ? stored === "true" : isSmallScreen);

watch(collapsed, (v) => localStorage.setItem(STORAGE_KEY, String(v)));

const {
  zoneVisibility,
  transitVisibility,
  fundaFavouriteVisible,
  fundaUnreviewedVisible,
  fundaDiscardedVisible,
  fundaFavouriteCount,
  fundaUnreviewedCount,
  fundaDiscardedCount,
  toggleZone,
  toggleTransit,
  toggleFundaFavourite,
  toggleFundaUnreviewed,
  toggleFundaDiscarded,
} = useZoneState();

const zones: { key: ZoneKey; label: string; color: string }[] = [
  { key: "10", label: "10 mins cycle", color: "#22c55e" },
  { key: "20", label: "20 mins cycle", color: "#f59e0b" },
  { key: "30", label: "30 mins cycle", color: "#ef4444" },
];

const transit: { key: TransitKey; label: string; color: string }[] = [
  { key: "train", label: "train stations", color: "#003DA5" },
  { key: "metro", label: "metro stations", color: "#E4003A" },
  { key: "tram", label: "tram stops", color: "#7B2D8E" },
];

const fundaItems = computed(() => [
  {
    key: "favourite",
    label: "favourite listings",
    color: COLORS.fundaFavourite,
    visible: fundaFavouriteVisible.value,
    count: fundaFavouriteCount.value,
    toggle: toggleFundaFavourite,
  },
  {
    key: "unreviewed",
    label: "unreviewed listings",
    color: COLORS.fundaUnreviewed,
    visible: fundaUnreviewedVisible.value,
    count: fundaUnreviewedCount.value,
    toggle: toggleFundaUnreviewed,
  },
  {
    key: "discarded",
    label: "discarded listings",
    color: COLORS.fundaDiscarded,
    visible: fundaDiscardedVisible.value,
    count: fundaDiscardedCount.value,
    toggle: toggleFundaDiscarded,
  },
]);
</script>
