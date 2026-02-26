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
  fundaFavouriteCount: Ref<number>;
  fundaUnreviewedCount: Ref<number>;
  fundaDiscardedCount: Ref<number>;
}

const emptyFC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type Category = "favourite" | "discarded" | "unreviewed";

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

export function listingsToGeoJSON(listings: Map<string, Listing>): GeoJSON.FeatureCollection {
  // Count co-located listings per coordinate, split by category
  const coordCats = new Map<string, { favourite: number; unreviewed: number; discarded: number }>();
  for (const listing of listings.values()) {
    const key = `${listing.longitude},${listing.latitude}`;
    let counts = coordCats.get(key);
    if (!counts) {
      counts = { favourite: 0, unreviewed: 0, discarded: 0 };
      coordCats.set(key, counts);
    }
    const cat: Category =
      listing.reaction === "favourite"
        ? "favourite"
        : listing.reaction === "discarded"
          ? "discarded"
          : "unreviewed";
    counts[cat]++;
  }

  // Track which coordinate keys have already had a primary feature assigned
  const primaryAssigned = new Set<string>();

  const features: GeoJSON.Feature[] = [];
  for (const listing of listings.values()) {
    const category: Category =
      listing.reaction === "favourite"
        ? "favourite"
        : listing.reaction === "discarded"
          ? "discarded"
          : "unreviewed";
    const key = `${listing.longitude},${listing.latitude}`;
    const counts = coordCats.get(key);
    const favourite = counts ? counts.favourite : 0;
    const unreviewed = counts ? counts.unreviewed : 0;
    const discarded = counts ? counts.discarded : 0;

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
        colocatedFavourite: favourite,
        colocatedUnreviewed: unreviewed,
        colocatedDiscarded: discarded,
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
    favouriteIds,
    discardedIds,
    lastViewedFundaId,
    fundaFavouriteVisible,
    fundaUnreviewedVisible,
    fundaDiscardedVisible,
    fundaFavouriteCount,
    fundaUnreviewedCount,
    fundaDiscardedCount,
  } = state;

  function refreshFundaSource() {
    const src = getGeoJSONSource(map, "funda");
    if (!src) return;
    const geojson = listingsToGeoJSON(listings.value);
    src.setData(geojson);

    // Re-apply paint properties so data-driven expressions (colocatedCount) evaluate
    updateFundaLayer();

    // Update counts
    fundaFavouriteCount.value = favouriteIds.value.size;
    fundaDiscardedCount.value = discardedIds.value.size;
    fundaUnreviewedCount.value =
      listings.value.size - favouriteIds.value.size - discardedIds.value.size;
  }

  const initialGeoJSON = listingsToGeoJSON(listings.value);
  fundaFavouriteCount.value = favouriteIds.value.size;
  fundaDiscardedCount.value = discardedIds.value.size;
  fundaUnreviewedCount.value =
    listings.value.size - favouriteIds.value.size - discardedIds.value.size;

  map.addSource("funda", { type: "geojson", data: initialGeoJSON });

  // --- Funda building highlights (below dots) ---
  map.addSource("funda-buildings", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "funda-building-fill",
    type: "fill",
    source: "funda-buildings",
    paint: {
      "fill-color": [
        "match",
        ["get", "category"],
        "favourite",
        COLORS.fundaFavourite,
        "discarded",
        COLORS.fundaDiscarded,
        COLORS.fundaUnreviewed,
      ],
      "fill-opacity": ["match", ["get", "category"], "discarded", 0.25, 0.4],
      "fill-opacity-transition": { duration: 200, delay: 0 },
    },
  });
  map.addLayer({
    id: "funda-building-outline",
    type: "line",
    source: "funda-buildings",
    paint: {
      "line-color": [
        "match",
        ["get", "category"],
        "favourite",
        COLORS.fundaFavourite,
        "discarded",
        COLORS.fundaDiscarded,
        COLORS.fundaUnreviewed,
      ],
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

  // Data-driven radius: scale up for co-located listings
  const totalColocated: maplibregl.ExpressionSpecification = [
    "+",
    ["get", "colocatedFavourite"],
    ["get", "colocatedUnreviewed"],
    ["get", "colocatedDiscarded"],
  ];
  const clusterRadius: maplibregl.ExpressionSpecification = [
    "step",
    totalColocated,
    5, // count 1: radius 5
    2,
    8, // count 2: radius 8
    3,
    10, // count 3: radius 10
    5,
    12, // count 5+: radius 12
  ];

  map.addLayer({
    id: "funda-circles",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": clusterRadius,
      "circle-radius-transition": { duration: 200, delay: 0 },
      "circle-color": [
        "case",
        isMixed,
        COLORS.fundaUnreviewed,
        [
          "match",
          ["get", "category"],
          "favourite",
          COLORS.fundaFavourite,
          "discarded",
          COLORS.fundaDiscarded,
          COLORS.fundaUnreviewed,
        ],
      ],
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

  // --- Funda visibility (3 independent toggles) ---
  function buildVisibleColocated(): maplibregl.ExpressionSpecification {
    const showFav = fundaFavouriteVisible.value;
    const showUnreviewed = fundaUnreviewedVisible.value;
    const showDiscarded = fundaDiscardedVisible.value;
    const expr: maplibregl.ExpressionSpecification = [
      "+",
      showFav ? ["get", "colocatedFavourite"] : 0,
      showUnreviewed ? ["get", "colocatedUnreviewed"] : 0,
      showDiscarded ? ["get", "colocatedDiscarded"] : 0,
    ];
    return expr;
  }

  function updateFundaLayer() {
    if (!map.getLayer("funda-circles")) return;
    const showFav = fundaFavouriteVisible.value;
    const showUnreviewed = fundaUnreviewedVisible.value;
    const showDiscarded = fundaDiscardedVisible.value;

    // Hitarea: filter instantly (for click handling only)
    const visibleCategories: string[] = [];
    if (showFav) visibleCategories.push("favourite");
    if (showUnreviewed) visibleCategories.push("unreviewed");
    if (showDiscarded) visibleCategories.push("discarded");

    const allVisible = showFav && showUnreviewed && showDiscarded;
    const categoryFilter: maplibregl.FilterSpecification | null = allVisible
      ? null
      : ["in", ["get", "category"], ["literal", visibleCategories]];

    // Apply same category filter to all funda layers
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

    // Update circle size + count label based on visible co-located count
    const visibleColocated = buildVisibleColocated();
    map.setPaintProperty("funda-circles", "circle-radius", [
      "step",
      visibleColocated,
      5, // count 1: radius 5
      2,
      8, // count 2: radius 8
      3,
      10, // count 3: radius 10
      5,
      12, // count 5+: radius 12
    ]);

    // Update count label text and filter to only show for visible clusters of 2+
    map.setFilter("funda-count", [
      "all",
      [">", visibleColocated, 1],
      ["==", ["get", "colocatedPrimary"], true],
    ]);
    map.setLayoutProperty("funda-count", "text-field", ["to-string", visibleColocated]);
  }

  updateFundaLayer();
  watch([fundaFavouriteVisible, fundaUnreviewedVisible, fundaDiscardedVisible], updateFundaLayer);

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

    let color: string = COLORS.fundaUnreviewed;
    if (listing.reaction === "favourite") {
      color = COLORS.fundaFavourite;
    } else if (listing.reaction === "discarded") {
      color = COLORS.fundaDiscarded;
    }

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
