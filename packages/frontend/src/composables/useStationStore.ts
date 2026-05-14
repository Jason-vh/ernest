import { ref } from "vue";
import { fetchStations } from "@/api/client";
import type { TransitStop } from "@/types/transit";

const stations = ref<TransitStop[]>([]);
let fetchPromise: Promise<void> | null = null;

export function useStationStore() {
  function ensureLoaded() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = fetchStations().then((data) => {
      stations.value = data;
    });
    return fetchPromise;
  }

  return { stations, ensureLoaded };
}
