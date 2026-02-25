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
  const features: GeoJSON.Feature[] = [];
  for (const listing of listings.values()) {
    const category: Category =
      listing.reaction === "favourite"
        ? "favourite"
        : listing.reaction === "discarded"
          ? "discarded"
          : "unreviewed";
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
      "line-width": 1.5,
    },
  });

  // Funda dots (above building highlights)
  map.addLayer({
    id: "funda-circles",
    type: "circle",
    source: "funda",
    paint: {
      "circle-radius": 5,
      "circle-color": [
        "match",
        ["get", "category"],
        "favourite",
        COLORS.fundaFavourite,
        "discarded",
        COLORS.fundaDiscarded,
        COLORS.fundaUnreviewed,
      ],
      "circle-opacity": ["match", ["get", "category"], "discarded", 0.5, 0.85],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
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
  const FUNDA_LAYERS = [
    "funda-circles",
    "funda-circles-hitarea",
    "funda-building-fill",
    "funda-building-outline",
  ];

  function updateFundaLayer() {
    if (!map.getLayer("funda-circles")) return;
    const showFav = fundaFavouriteVisible.value;
    const showUnreviewed = fundaUnreviewedVisible.value;
    const showDiscarded = fundaDiscardedVisible.value;

    if (!showFav && !showUnreviewed && !showDiscarded) {
      for (const id of FUNDA_LAYERS) {
        map.setLayoutProperty(id, "visibility", "none");
      }
      return;
    }

    for (const id of FUNDA_LAYERS) {
      map.setLayoutProperty(id, "visibility", "visible");
    }

    // Build category filter
    const visibleCategories: string[] = [];
    if (showFav) visibleCategories.push("favourite");
    if (showUnreviewed) visibleCategories.push("unreviewed");
    if (showDiscarded) visibleCategories.push("discarded");

    const allVisible = showFav && showUnreviewed && showDiscarded;
    const categoryFilter: maplibregl.FilterSpecification = allVisible
      ? null!
      : ["in", ["get", "category"], ["literal", visibleCategories]];

    // Shared layers: full category filter (or none)
    for (const id of [
      "funda-circles",
      "funda-circles-hitarea",
      "funda-building-fill",
      "funda-building-outline",
    ]) {
      map.setFilter(id, allVisible ? null : categoryFilter);
    }
  }

  updateFundaLayer();
  watch([fundaFavouriteVisible, fundaUnreviewedVisible, fundaDiscardedVisible], updateFundaLayer);

  return { refreshFundaSource };
}
