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
  fundaNew: boolean,
  fundaViewed: boolean,
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
  if (!fundaNew) {
    params.set("funda", "0");
  }

  params.delete("funda-viewed");
  if (!fundaViewed) {
    params.set("funda-viewed", "0");
  }

  const search = params.toString();
  const url = search
    ? `${window.location.pathname}?${search}`
    : window.location.pathname;
  history.replaceState(null, "", url);
}

// Clicked funda listings (persisted in localStorage)
const CLICKED_FUNDA_KEY = "ernest:clickedFunda";

function loadClickedFunda(): Set<string> {
  try {
    const raw = localStorage.getItem(CLICKED_FUNDA_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveClickedFunda(ids: Set<string>) {
  localStorage.setItem(CLICKED_FUNDA_KEY, JSON.stringify([...ids]));
}

// Shared singleton state
const zoneVisibility = ref(readVisibility("zones", ZONE_KEYS));
const transitVisibility = ref(readVisibility("transit", TRANSIT_KEYS));
const fundaNewVisible = ref(
  new URLSearchParams(window.location.search).get("funda") !== "0",
);
const fundaViewedVisible = ref(
  new URLSearchParams(window.location.search).get("funda-viewed") !== "0",
);
const hoveredZone = ref<ZoneKey | null>(null);
const clickedFundaUrls = ref(loadClickedFunda());

watch(
  [zoneVisibility, transitVisibility, fundaNewVisible, fundaViewedVisible],
  () => writeToURL(zoneVisibility.value, transitVisibility.value, fundaNewVisible.value, fundaViewedVisible.value),
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

  function toggleFundaNew() {
    fundaNewVisible.value = !fundaNewVisible.value;
  }

  function toggleFundaViewed() {
    fundaViewedVisible.value = !fundaViewedVisible.value;
  }

  function markFundaClicked(url: string) {
    clickedFundaUrls.value = new Set([...clickedFundaUrls.value, url]);
    saveClickedFunda(clickedFundaUrls.value);
  }

  return {
    zoneVisibility,
    transitVisibility,
    fundaNewVisible,
    fundaViewedVisible,
    hoveredZone,
    clickedFundaUrls,
    toggleZone,
    toggleTransit,
    toggleFundaNew,
    toggleFundaViewed,
    markFundaClicked,
  };
}
