import { ref, watch } from "vue";

export const ZONE_KEYS = ["10", "20", "30"] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

export const TRANSIT_KEYS = ["train", "metro", "tram", "ferry"] as const;
export type TransitKey = (typeof TRANSIT_KEYS)[number];

const STORAGE_KEY = "ernest:legend";

interface LegendState {
  zones: Record<ZoneKey, boolean>;
  transit: Record<TransitKey, boolean>;
  fundaFav: boolean;
  fundaUnreviewed: boolean;
  fundaDiscarded: boolean;
}

function allTrue<T extends string>(keys: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true])) as Record<T, boolean>;
}

function readFromStorage(): LegendState {
  const defaults: LegendState = {
    zones: allTrue(ZONE_KEYS),
    transit: allTrue(TRANSIT_KEYS),
    fundaFav: true,
    fundaUnreviewed: true,
    fundaDiscarded: false,
  };

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<LegendState>;
    return {
      zones:
        typeof parsed.zones === "object" && parsed.zones !== null ? parsed.zones : defaults.zones,
      transit:
        typeof parsed.transit === "object" && parsed.transit !== null
          ? { ...defaults.transit, ...parsed.transit }
          : defaults.transit,
      fundaFav: typeof parsed.fundaFav === "boolean" ? parsed.fundaFav : defaults.fundaFav,
      fundaUnreviewed:
        typeof parsed.fundaUnreviewed === "boolean"
          ? parsed.fundaUnreviewed
          : defaults.fundaUnreviewed,
      fundaDiscarded:
        typeof parsed.fundaDiscarded === "boolean"
          ? parsed.fundaDiscarded
          : defaults.fundaDiscarded,
    };
  } catch {
    return defaults;
  }
}

function writeToStorage(state: LegendState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Shared singleton state
const saved = readFromStorage();
const zoneVisibility = ref(saved.zones);
const transitVisibility = ref(saved.transit);
const fundaFavouriteVisible = ref(saved.fundaFav);
const fundaUnreviewedVisible = ref(saved.fundaUnreviewed);
const fundaDiscardedVisible = ref(saved.fundaDiscarded);

const hoveredZone = ref<ZoneKey | null>(null);
const hoveredTransit = ref<TransitKey | null>(null);

const fundaFavouriteCount = ref(0);
const fundaUnreviewedCount = ref(0);
const fundaDiscardedCount = ref(0);

watch(
  [
    zoneVisibility,
    transitVisibility,
    fundaFavouriteVisible,
    fundaUnreviewedVisible,
    fundaDiscardedVisible,
  ],
  () =>
    writeToStorage({
      zones: zoneVisibility.value,
      transit: transitVisibility.value,
      fundaFav: fundaFavouriteVisible.value,
      fundaUnreviewed: fundaUnreviewedVisible.value,
      fundaDiscarded: fundaDiscardedVisible.value,
    }),
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

  function toggleFundaFavourite() {
    fundaFavouriteVisible.value = !fundaFavouriteVisible.value;
  }

  function toggleFundaUnreviewed() {
    fundaUnreviewedVisible.value = !fundaUnreviewedVisible.value;
  }

  function toggleFundaDiscarded() {
    fundaDiscardedVisible.value = !fundaDiscardedVisible.value;
  }

  return {
    zoneVisibility,
    transitVisibility,
    fundaFavouriteVisible,
    fundaUnreviewedVisible,
    fundaDiscardedVisible,
    hoveredZone,
    hoveredTransit,
    fundaFavouriteCount,
    fundaUnreviewedCount,
    fundaDiscardedCount,
    toggleZone,
    toggleTransit,
    toggleFundaFavourite,
    toggleFundaUnreviewed,
    toggleFundaDiscarded,
  };
}
