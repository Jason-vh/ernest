<template>
  <div
    class="glass absolute bottom-3 left-3 z-1 flex min-w-40 flex-col gap-2 p-3 px-4 font-sans text-[13px]"
  >
    <div class="text-[11px] font-semibold uppercase tracking-wide text-[#999]">cycle distance</div>
    <div class="flex flex-col gap-[5px]">
      <button
        v-for="item in zones"
        :key="item.key"
        :aria-pressed="zoneVisibility[item.key]"
        class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
        @mouseenter="hoveredZone = item.key"
        @mouseleave="hoveredZone = null"
        @click="toggleZone(item.key)"
      >
        <span
          class="h-2.5 w-4 shrink-0 rounded-sm transition-opacity"
          :class="zoneVisibility[item.key] ? 'opacity-35' : 'opacity-12'"
          :style="{ backgroundColor: item.color }"
        ></span>
        <span
          class="font-[450] transition-opacity"
          :class="zoneVisibility[item.key] ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'"
          >{{ item.label }}</span
        >
      </button>
    </div>
    <div class="h-px bg-[#e5e5e5]"></div>
    <div class="text-[11px] font-semibold uppercase tracking-wide text-[#999]">transit</div>
    <div class="flex flex-col gap-[5px]">
      <button
        v-for="item in transit"
        :key="item.key"
        :aria-pressed="transitVisibility[item.key]"
        class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
        @mouseenter="hoveredTransit = item.key"
        @mouseleave="hoveredTransit = null"
        @click="toggleTransit(item.key)"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/90 shadow-sm transition-opacity"
          :class="transitVisibility[item.key] ? '' : 'opacity-12'"
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
    <div class="h-px bg-[#e5e5e5]"></div>
    <div class="text-[11px] font-semibold uppercase tracking-wide text-[#999]">funda</div>
    <div class="flex flex-col gap-[5px]">
      <button
        :aria-pressed="fundaNewVisible"
        class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
        @click="toggleFundaNew()"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/90 shadow-sm transition-opacity"
          :class="fundaNewVisible ? '' : 'opacity-12'"
          style="background-color: #e8950f"
        ></span>
        <span
          class="font-[450] transition-opacity"
          :class="fundaNewVisible ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'"
          >unseen listings</span
        >
      </button>
      <button
        :aria-pressed="fundaViewedVisible"
        class="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-0.5 -mx-1 -my-0.5 transition-colors hover:bg-black/5"
        @click="toggleFundaViewed()"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-white/90 shadow-sm transition-opacity"
          :class="fundaViewedVisible ? '' : 'opacity-12'"
          style="background-color: #aaa"
        ></span>
        <span
          class="font-[450] transition-opacity"
          :class="fundaViewedVisible ? 'text-[#444]' : 'text-[#444] opacity-35 line-through'"
          >viewed listings</span
        >
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useZoneState, type ZoneKey, type TransitKey } from "@/composables/useZoneState";

const {
  zoneVisibility,
  transitVisibility,
  fundaNewVisible,
  fundaViewedVisible,
  hoveredZone,
  hoveredTransit,
  toggleZone,
  toggleTransit,
  toggleFundaNew,
  toggleFundaViewed,
} = useZoneState();

const zones: { key: ZoneKey; label: string; color: string }[] = [
  { key: "10", label: "in 10 mins", color: "#22c55e" },
  { key: "20", label: "in 20 mins", color: "#f59e0b" },
  { key: "30", label: "in 30 mins", color: "#ef4444" },
];

const transit: { key: TransitKey; label: string; color: string }[] = [
  { key: "train", label: "train", color: "#003DA5" },
  { key: "metro", label: "metro", color: "#E4003A" },
  { key: "tram", label: "tram", color: "#7B2D8E" },
];
</script>
