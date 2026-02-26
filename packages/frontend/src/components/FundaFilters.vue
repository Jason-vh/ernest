<template>
  <div
    class="glass absolute bottom-3 right-3 z-1 cursor-pointer select-none p-3 px-4 font-sans transition-colors hover:bg-white/50 hidden sm:block"
    @click="open = !open"
  >
    <button class="flex w-full cursor-pointer items-center gap-1.5" :aria-expanded="open">
      <span class="h-[7px] w-[7px] shrink-0 rounded-full bg-funda"></span>
      <span class="flex-1 text-[11px] font-semibold uppercase tracking-wide text-[#999]">
        {{ fundaCount > 0 ? `${fundaCount} properties` : "funda search" }}
      </span>
      <svg
        class="shrink-0 text-[#bbb] transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        width="10"
        height="10"
        viewBox="0 0 10 10"
      >
        <path
          d="M3 4l2 2 2-2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <div
      class="grid transition-[grid-template-rows] duration-200"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden">
        <div class="flex flex-col gap-1 pt-2">
          <span
            v-for="chip in chips"
            :key="chip"
            class="w-fit whitespace-nowrap rounded-full border border-[rgba(232,149,15,0.2)] bg-[rgba(232,149,15,0.12)] px-2 py-0.5 text-[11px] font-medium leading-[1.4] text-[#6b5c00]"
          >
            {{ chip }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useZoneState } from "@/composables/useZoneState";

const open = ref(false);
const { fundaFavouriteCount, fundaUnreviewedCount, fundaDiscardedCount } = useZoneState();
const fundaCount = computed(
  () => fundaFavouriteCount.value + fundaUnreviewedCount.value + fundaDiscardedCount.value,
);

const chips = ["€450k – €680k", "≥ 2 bedrooms", "≥ 65 m²", "label A/B/C/D"];
</script>
