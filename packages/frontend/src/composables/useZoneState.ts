import { ref, watch } from "vue";

export const ZONE_KEYS = ["10", "20", "30"] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

export const TRANSIT_KEYS = ["train", "metro", "tram"] as const;
export type TransitKey = (typeof TRANSIT_KEYS)[number];

function readVisibility<T extends string>(
  param: string,
  allKeys: readonly T[],
): Record<T, boolean> {
  const params = new URLSearchParams(window.location.search);
  const values = params.getAll(param);
  if (values.length === 0) {
    return Object.fromEntries(allKeys.map((k) => [k, true])) as Record<T, boolean>;
  }
  const enabled = new Set(values);
  return Object.fromEntries(allKeys.map((k) => [k, enabled.has(k)])) as Record<T, boolean>;
}

function writeToURL(
  zones: Record<ZoneKey, boolean>,
  transit: Record<TransitKey, boolean>,
  funda: boolean,
) {
  const params = new URLSearchParams(window.location.search);

  params.delete("zones");
  const enabledZones = ZONE_KEYS.filter((k) => zones[k]);
  if (enabledZones.length < ZONE_KEYS.length) {
    for (const z of enabledZones) params.append("zones", z);
  }

  params.delete("transit");
  const enabledTransit = TRANSIT_KEYS.filter((k) => transit[k]);
  if (enabledTransit.length < TRANSIT_KEYS.length) {
    for (const t of enabledTransit) params.append("transit", t);
  }

  params.delete("funda");
  if (!funda) {
    params.set("funda", "0");
  }

  const search = params.toString();
  const url = search
    ? `${window.location.pathname}?${search}`
    : window.location.pathname;
  history.replaceState(null, "", url);
}

// Shared singleton state
const zoneVisibility = ref(readVisibility("zones", ZONE_KEYS));
const transitVisibility = ref(readVisibility("transit", TRANSIT_KEYS));
const fundaVisible = ref(
  new URLSearchParams(window.location.search).get("funda") !== "0",
);
const hoveredZone = ref<ZoneKey | null>(null);

watch(
  [zoneVisibility, transitVisibility, fundaVisible],
  () => writeToURL(zoneVisibility.value, transitVisibility.value, fundaVisible.value),
  { deep: true },
);

export function useZoneState() {
  function toggleZone(zone: ZoneKey) {
    zoneVisibility.value = {
      ...zoneVisibility.value,
      [zone]: !zoneVisibility.value[zone],
    };
  }

  function toggleTransit(key: TransitKey) {
    transitVisibility.value = {
      ...transitVisibility.value,
      [key]: !transitVisibility.value[key],
    };
  }

  function toggleFunda() {
    fundaVisible.value = !fundaVisible.value;
  }

  return {
    zoneVisibility,
    transitVisibility,
    fundaVisible,
    hoveredZone,
    toggleZone,
    toggleTransit,
    toggleFunda,
  };
}
