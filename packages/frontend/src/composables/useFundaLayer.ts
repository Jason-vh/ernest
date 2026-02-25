import type { Ref } from "vue";
import { watch } from "vue";
import type maplibregl from "maplibre-gl";
import type { Listing } from "@ernest/shared";
import { COLORS } from "@/geo/constants";
import { getGeoJSONSource } from "@/geo/map-utils";

interface FundaState {
  favouriteIds: Ref<Set<string>>;
  discardedIds: Ref<Set<string>>;
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

  const features: GeoJSON.Feature[] = [];
  for (const listing of listings.values()) {
    const category: Category =
      listing.reaction === "favourite"
        ? "favourite"
        : listing.reaction === "discarded"
          ? "discarded"
          : "unreviewed";
    const key = `${listing.longitude},${listing.latitude}`;
    const counts = coordCats.get(key)!;
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
  map.addLayer({
    id: "funda-circles",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": [
        "case",
        [
          ">",
          [
            "+",
            ["get", "colocatedFavourite"],
            ["get", "colocatedUnreviewed"],
            ["get", "colocatedDiscarded"],
          ],
          1,
        ],
        6.5,
        5,
      ],
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
    } else {
      map.setLayoutProperty("funda-circles-hitarea", "visibility", "visible");
      map.setLayoutProperty("funda-circles", "visibility", "visible");
      map.setFilter("funda-circles-hitarea", categoryFilter);
      map.setFilter("funda-circles", categoryFilter);
    }
    map.setFilter("funda-building-fill", categoryFilter);
    map.setFilter("funda-building-outline", categoryFilter);

    // Update circle size based on visible co-located count
    const visibleColocated = [
      "+",
      showFav ? ["get", "colocatedFavourite"] : 0,
      showUnreviewed ? ["get", "colocatedUnreviewed"] : 0,
      showDiscarded ? ["get", "colocatedDiscarded"] : 0,
    ];
    map.setPaintProperty("funda-circles", "circle-radius", [
      "case",
      [">", visibleColocated, 1],
      6.5,
      5,
    ]);
  }

  updateFundaLayer();
  watch([fundaFavouriteVisible, fundaUnreviewedVisible, fundaDiscardedVisible], updateFundaLayer);

  return { refreshFundaSource };
}
