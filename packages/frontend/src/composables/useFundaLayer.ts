import type { Ref } from "vue";
import { watch } from "vue";
import maplibregl from "maplibre-gl";
import type { Listing } from "@ernest/shared";
import { COLORS } from "@/geo/constants";
import { getGeoJSONSource } from "@/geo/map-utils";

interface FundaState {
  favouriteIds: Ref<Set<string>>;
  discardedIds: Ref<Set<string>>;
  lastViewedFundaId: Ref<string | null>;
  fundaFavouriteVisible: Ref<boolean>;
  fundaUnreviewedVisible: Ref<boolean>;
  fundaDiscardedVisible: Ref<boolean>;
  fundaViewingVisible: Ref<boolean>;
  fundaAppliedVisible: Ref<boolean>;
  fundaFavouriteCount: Ref<number>;
  fundaUnreviewedCount: Ref<number>;
  fundaDiscardedCount: Ref<number>;
  fundaViewingCount: Ref<number>;
  fundaAppliedCount: Ref<number>;
}

const emptyFC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type Category = "favourite" | "discarded" | "unreviewed" | "viewing" | "applied";

function categorize(state: string | null | undefined): Category {
  if (state === "liked") return "favourite";
  if (state === "discarded") return "discarded";
  if (state === "viewing") return "viewing";
  if (state === "applied") return "applied";
  return "unreviewed";
}

function createPulseElement(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "funda-pulse-marker";
  el.style.width = "12px";
  el.style.height = "12px";
  el.style.position = "relative";
  const ring1 = document.createElement("div");
  ring1.className = "funda-pulse-ring";
  ring1.style.borderColor = color;
  const ring2 = document.createElement("div");
  ring2.className = "funda-pulse-ring";
  ring2.style.borderColor = color;
  el.appendChild(ring1);
  el.appendChild(ring2);
  return el;
}

type Counts = Record<Category, number>;
const emptyCounts = (): Counts => ({
  favourite: 0,
  unreviewed: 0,
  discarded: 0,
  viewing: 0,
  applied: 0,
});

export function listingsToGeoJSON(listings: Map<string, Listing>): GeoJSON.FeatureCollection {
  // Count co-located listings per coordinate, split by category
  const coordCats = new Map<string, Counts>();
  for (const listing of listings.values()) {
    const key = `${listing.longitude},${listing.latitude}`;
    let counts = coordCats.get(key);
    if (!counts) {
      counts = emptyCounts();
      coordCats.set(key, counts);
    }
    counts[categorize(listing.state)]++;
  }

  // Track which coordinate keys have already had a primary feature assigned
  const primaryAssigned = new Set<string>();

  const features: GeoJSON.Feature[] = [];
  for (const listing of listings.values()) {
    const category = categorize(listing.state);
    const key = `${listing.longitude},${listing.latitude}`;
    const counts = coordCats.get(key) ?? emptyCounts();

    // Only one feature per coordinate should render the count label
    const isPrimary = !primaryAssigned.has(key);
    if (isPrimary) primaryAssigned.add(key);

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [listing.longitude, listing.latitude],
      },
      properties: {
        fundaId: listing.fundaId,
        url: listing.url,
        price: listing.price,
        address: listing.address,
        bedrooms: listing.bedrooms,
        livingArea: listing.livingArea,
        photo: listing.photos.length > 0 ? listing.photos[0] : "",
        category,
        colocatedFavourite: counts.favourite,
        colocatedUnreviewed: counts.unreviewed,
        colocatedDiscarded: counts.discarded,
        colocatedViewing: counts.viewing,
        colocatedApplied: counts.applied,
        colocatedPrimary: isPrimary,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export function useFundaLayer(
  map: maplibregl.Map,
  listings: Ref<Map<string, Listing>>,
  state: FundaState,
) {
  const {
    lastViewedFundaId,
    fundaFavouriteVisible,
    fundaUnreviewedVisible,
    fundaDiscardedVisible,
    fundaViewingVisible,
    fundaAppliedVisible,
    fundaFavouriteCount,
    fundaUnreviewedCount,
    fundaDiscardedCount,
    fundaViewingCount,
    fundaAppliedCount,
  } = state;

  function tallyCounts(): Counts {
    const counts = emptyCounts();
    for (const listing of listings.value.values()) {
      counts[categorize(listing.state)]++;
    }
    return counts;
  }

  function applyCounts(counts: Counts) {
    fundaFavouriteCount.value = counts.favourite;
    fundaUnreviewedCount.value = counts.unreviewed;
    fundaDiscardedCount.value = counts.discarded;
    fundaViewingCount.value = counts.viewing;
    fundaAppliedCount.value = counts.applied;
  }

  function refreshFundaSource() {
    const src = getGeoJSONSource(map, "funda");
    if (!src) return;
    const geojson = listingsToGeoJSON(listings.value);
    src.setData(geojson);

    // Re-apply paint properties so data-driven expressions (colocatedCount) evaluate
    updateFundaLayer();
    applyCounts(tallyCounts());
  }

  const initialGeoJSON = listingsToGeoJSON(listings.value);
  applyCounts(tallyCounts());

  map.addSource("funda", { type: "geojson", data: initialGeoJSON });

  watch(listings, refreshFundaSource, { deep: true });

  // --- Funda building highlights (below dots) ---
  map.addSource("funda-buildings", { type: "geojson", data: emptyFC });
  const categoryColor: maplibregl.ExpressionSpecification = [
    "match",
    ["get", "category"],
    "favourite",
    COLORS.fundaFavourite,
    "discarded",
    COLORS.fundaDiscarded,
    "viewing",
    COLORS.fundaViewing,
    "applied",
    COLORS.fundaApplied,
    COLORS.fundaUnreviewed,
  ];

  map.addLayer({
    id: "funda-building-fill",
    type: "fill",
    source: "funda-buildings",
    paint: {
      "fill-color": categoryColor,
      "fill-opacity": ["match", ["get", "category"], "discarded", 0.25, 0.4],
      "fill-opacity-transition": { duration: 200, delay: 0 },
    },
  });
  map.addLayer({
    id: "funda-building-outline",
    type: "line",
    source: "funda-buildings",
    paint: {
      "line-color": categoryColor,
      "line-opacity": ["match", ["get", "category"], "discarded", 0.4, 0.7],
      "line-opacity-transition": { duration: 200, delay: 0 },
      "line-width": 1.5,
    },
  });

  // Funda dots (above building highlights)
  // Mixed-category locations (favourite + unreviewed) show as unreviewed
  const isMixed: maplibregl.ExpressionSpecification = [
    "all",
    [">", ["get", "colocatedFavourite"], 0],
    [">", ["get", "colocatedUnreviewed"], 0],
  ];

  const totalColocated: maplibregl.ExpressionSpecification = [
    "+",
    ["get", "colocatedFavourite"],
    ["get", "colocatedUnreviewed"],
    ["get", "colocatedDiscarded"],
    ["get", "colocatedViewing"],
    ["get", "colocatedApplied"],
  ];

  map.addLayer({
    id: "funda-circles",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": ["step", totalColocated, 5, 2, 7.5],
      "circle-radius-transition": { duration: 200, delay: 0 },
      "circle-color": ["case", isMixed, COLORS.fundaUnreviewed, categoryColor],
      "circle-opacity": ["match", ["get", "category"], "discarded", 0.5, 0.85],
      "circle-opacity-transition": { duration: 200, delay: 0 },
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-stroke-opacity-transition": { duration: 200, delay: 0 },
    },
  });

  // Pulse marker for last-viewed listing (shown after closing modal)
  let pulseMarker: maplibregl.Marker | null = null;

  // Count label on clusters (only for co-located locations with 2+ listings)
  // Only one feature per coordinate needs to show the label; use colocatedPrimary flag
  map.addLayer({
    id: "funda-count",
    type: "symbol",
    source: "funda",
    filter: ["all", [">", totalColocated, 1], ["==", ["get", "colocatedPrimary"], true]],
    layout: {
      "text-field": ["to-string", totalColocated],
      "text-size": 10,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#fff",
      "text-halo-color": "rgba(0,0,0,0.3)",
      "text-halo-width": 0.5,
    },
  });

  // Invisible larger hit area for easier tapping on touch devices
  map.addLayer({
    id: "funda-circles-hitarea",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": 20,
      "circle-color": "transparent",
      "circle-opacity": 0,
    },
  });

  // --- Funda visibility (5 independent toggles) ---
  function buildVisibleColocated(): maplibregl.ExpressionSpecification {
    return [
      "+",
      fundaFavouriteVisible.value ? ["get", "colocatedFavourite"] : 0,
      fundaUnreviewedVisible.value ? ["get", "colocatedUnreviewed"] : 0,
      fundaDiscardedVisible.value ? ["get", "colocatedDiscarded"] : 0,
      fundaViewingVisible.value ? ["get", "colocatedViewing"] : 0,
      fundaAppliedVisible.value ? ["get", "colocatedApplied"] : 0,
    ];
  }

  function updateFundaLayer() {
    if (!map.getLayer("funda-circles")) return;

    const visibleCategories: Category[] = [];
    if (fundaFavouriteVisible.value) visibleCategories.push("favourite");
    if (fundaUnreviewedVisible.value) visibleCategories.push("unreviewed");
    if (fundaDiscardedVisible.value) visibleCategories.push("discarded");
    if (fundaViewingVisible.value) visibleCategories.push("viewing");
    if (fundaAppliedVisible.value) visibleCategories.push("applied");

    const allVisible = visibleCategories.length === 5;
    const categoryFilter: maplibregl.FilterSpecification | null = allVisible
      ? null
      : ["in", ["get", "category"], ["literal", visibleCategories]];

    if (visibleCategories.length === 0) {
      map.setLayoutProperty("funda-circles-hitarea", "visibility", "none");
      map.setLayoutProperty("funda-circles", "visibility", "none");
      map.setLayoutProperty("funda-count", "visibility", "none");
    } else {
      map.setLayoutProperty("funda-circles-hitarea", "visibility", "visible");
      map.setLayoutProperty("funda-circles", "visibility", "visible");
      map.setLayoutProperty("funda-count", "visibility", "visible");
      map.setFilter("funda-circles-hitarea", categoryFilter);
      map.setFilter("funda-circles", categoryFilter);
    }
    map.setFilter("funda-building-fill", categoryFilter);
    map.setFilter("funda-building-outline", categoryFilter);

    const visibleColocated = buildVisibleColocated();
    map.setFilter("funda-count", [
      "all",
      [">", visibleColocated, 1],
      ["==", ["get", "colocatedPrimary"], true],
    ]);
    map.setLayoutProperty("funda-count", "text-field", ["to-string", visibleColocated]);
  }

  updateFundaLayer();
  watch(
    [
      fundaFavouriteVisible,
      fundaUnreviewedVisible,
      fundaDiscardedVisible,
      fundaViewingVisible,
      fundaAppliedVisible,
    ],
    updateFundaLayer,
  );

  // Update pulse marker when last-viewed listing changes
  function clearPulseMarker() {
    if (pulseMarker) {
      pulseMarker.remove();
      pulseMarker = null;
    }
  }

  function updatePulseMarker() {
    clearPulseMarker();

    const id = lastViewedFundaId.value;
    if (!id) return;

    // Hide pulse when zoomed in far enough for building highlights
    if (map.getZoom() >= 15) return;

    const listing = listings.value.get(id);
    if (!listing) return;

    const pulseColors: Record<Category, string> = {
      favourite: COLORS.fundaFavourite,
      discarded: COLORS.fundaDiscarded,
      viewing: COLORS.fundaViewing,
      applied: COLORS.fundaApplied,
      unreviewed: COLORS.fundaUnreviewed,
    };
    const color = pulseColors[categorize(listing.state)];

    pulseMarker = new maplibregl.Marker({
      element: createPulseElement(color),
      anchor: "center",
    })
      .setLngLat([listing.longitude, listing.latitude])
      .addTo(map);
  }

  watch(lastViewedFundaId, updatePulseMarker);

  // Hide/show pulse marker based on zoom level (building highlights take over at zoom >= 15)
  map.on("zoom", () => {
    const id = lastViewedFundaId.value;
    if (!id) return;

    if (map.getZoom() >= 15) {
      clearPulseMarker();
    } else if (!pulseMarker) {
      updatePulseMarker();
    }
  });

  return { refreshFundaSource };
}
