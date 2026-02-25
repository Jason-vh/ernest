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
  fundaFav: boolean,
  fundaUnreviewed: boolean,
  fundaDiscarded: boolean,
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

  // Only write non-default values
  params.delete("funda-fav");
  if (!fundaFav) {
    params.set("funda-fav", "0");
  }

  params.delete("funda-unreviewed");
  if (!fundaUnreviewed) {
    params.set("funda-unreviewed", "0");
  }

  params.delete("funda-discarded");
  if (fundaDiscarded) {
    params.set("funda-discarded", "1");
  }

  // Clean up old params
  params.delete("funda");
  params.delete("funda-viewed");

  const search = params.toString();
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  history.replaceState(null, "", url);
}

// Shared singleton state
const zoneVisibility = ref(readVisibility("zones", ZONE_KEYS));
const transitVisibility = ref(readVisibility("transit", TRANSIT_KEYS));

const searchParams = new URLSearchParams(window.location.search);
const fundaFavouriteVisible = ref(searchParams.get("funda-fav") !== "0");
const fundaUnreviewedVisible = ref(searchParams.get("funda-unreviewed") !== "0");
const fundaDiscardedVisible = ref(searchParams.get("funda-discarded") === "1");

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
    writeToURL(
      zoneVisibility.value,
      transitVisibility.value,
      fundaFavouriteVisible.value,
      fundaUnreviewedVisible.value,
      fundaDiscardedVisible.value,
    ),
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
