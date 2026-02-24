<template>
  <div class="legend">
    <div class="legend-title">cycle distance</div>
    <div class="legend-items">
      <div
        class="legend-item legend-item--toggle"
        :class="{ 'legend-item--disabled': !zoneVisibility[item.key] }"
        v-for="item in zones"
        :key="item.key"
        @mouseenter="hoveredZone = item.key"
        @mouseleave="hoveredZone = null"
        @click="toggleZone(item.key)"
      >
        <span class="legend-swatch" :style="{ backgroundColor: item.color }"></span>
        <span class="legend-label">{{ item.label }}</span>
      </div>
    </div>
    <div class="legend-divider"></div>
    <div class="legend-title">transit</div>
    <div class="legend-items">
      <div
        class="legend-item legend-item--toggle"
        :class="{ 'legend-item--disabled': !transitVisibility[item.key] }"
        v-for="item in transit"
        :key="item.key"
        @mouseenter="hoveredTransit = item.key"
        @mouseleave="hoveredTransit = null"
        @click="toggleTransit(item.key)"
      >
        <span class="legend-dot" :style="{ backgroundColor: item.color }"></span>
        <span class="legend-label">{{ item.label }}</span>
      </div>
    </div>
    <div class="legend-divider"></div>
    <div class="legend-title">funda</div>
    <div class="legend-items">
      <div
        class="legend-item legend-item--toggle"
        :class="{ 'legend-item--disabled': !fundaNewVisible }"
        @click="toggleFundaNew()"
      >
        <span class="legend-dot" style="background-color: #E8950F"></span>
        <span class="legend-label">unseen listings</span>
      </div>
      <div
        class="legend-item legend-item--toggle"
        :class="{ 'legend-item--disabled': !fundaViewedVisible }"
        @click="toggleFundaViewed()"
      >
        <span class="legend-dot" style="background-color: #aaa"></span>
        <span class="legend-label">viewed listings</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useZoneState, type ZoneKey, type TransitKey } from "../composables/useZoneState";

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

<style scoped>
.legend {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 10px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 160px;
}

.legend-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-item--toggle {
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background-color 0.15s;
}

.legend-item--toggle:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.legend-item--disabled .legend-swatch,
.legend-item--disabled .legend-dot {
  opacity: 0.12 !important;
}

.legend-item--disabled .legend-label {
  opacity: 0.35;
  text-decoration: line-through;
}

.legend-swatch {
  width: 16px;
  height: 10px;
  border-radius: 2px;
  opacity: 0.35;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.legend-label {
  color: #444;
  font-weight: 450;
  transition: opacity 0.15s;
}

.legend-divider {
  height: 1px;
  background: #e5e5e5;
}
</style>
