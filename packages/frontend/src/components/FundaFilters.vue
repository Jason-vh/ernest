<template>
  <div class="funda-filters" :class="{ 'funda-filters--open': open }" @click="open = !open">
    <div class="funda-filters-header">
      <span class="funda-filters-dot"></span>
      <span class="funda-filters-title">
        {{ fundaCount > 0 ? `${fundaCount} properties` : 'funda search' }}
      </span>
      <svg
        class="funda-filters-chevron"
        width="10"
        height="10"
        viewBox="0 0 10 10"
      >
        <path d="M3 4l2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="funda-filters-body">
      <div class="funda-filters-body-inner">
        <div class="filter-chips">
          <span class="chip">€450k – €600k</span>
          <span class="chip">≥ 2 bedrooms</span>
          <span class="chip">≥ 65 m²</span>
          <span class="chip">label A/B/C/D</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useZoneState } from "../composables/useZoneState";

const open = ref(false);
const { fundaCount } = useZoneState();
</script>

<style scoped>
.funda-filters {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 10px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  font-family: system-ui, -apple-system, sans-serif;
  z-index: 1;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.funda-filters:hover {
  background: rgba(255, 255, 255, 0.5);
}

.funda-filters-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.funda-filters-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #E8950F;
  flex-shrink: 0;
}

.funda-filters-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
  flex: 1;
}

.funda-filters-chevron {
  color: #bbb;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.funda-filters--open .funda-filters-chevron {
  transform: rotate(180deg);
}

/* Smooth expand/collapse via CSS grid */
.funda-filters-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease;
}

.funda-filters--open .funda-filters-body {
  grid-template-rows: 1fr;
}

.funda-filters-body-inner {
  overflow: hidden;
}

.filter-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
}

.chip {
  font-size: 11px;
  font-weight: 500;
  color: #6b5c00;
  background: rgba(232, 149, 15, 0.12);
  border: 1px solid rgba(232, 149, 15, 0.2);
  border-radius: 100px;
  padding: 2px 8px;
  white-space: nowrap;
  line-height: 1.4;
  width: fit-content;
}


@media (max-width: 640px) {
  .funda-filters {
    display: none;
  }
}
</style>
