import type { StyleSpecification } from "maplibre-gl";

const GREEN_PATTERNS = [
  "park",
  "grass",
  "wood",
  "forest",
  "vegetation",
  "garden",
  "cemetery",
  "landcover-grass",
  "landcover-wood",
  "landuse-cemetery",
  "landuse-park",
];

const WATER_PATTERNS = ["water"];

function isColorString(s: string): boolean {
  if (
    s.startsWith("#") &&
    (s.length === 4 || s.length === 7 || s.length === 9)
  ) {
    return /^#[0-9a-fA-F]+$/.test(s);
  }
  if (s.startsWith("rgb") || s.startsWith("hsl")) return true;
  return false;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toGreyscale(color: string): string {
  if (color.startsWith("#")) {
    const [r, g, b] = hexToRgb(color);
    const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const h = grey.toString(16).padStart(2, "0");
    return `#${h}${h}${h}`;
  }
  if (color.startsWith("rgba")) {
    const match = color.match(/[\d.]+/g);
    if (match) {
      const [r, g, b, a] = match.map(Number);
      const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      return `rgba(${grey},${grey},${grey},${a})`;
    }
  }
  if (color.startsWith("rgb")) {
    const match = color.match(/[\d.]+/g);
    if (match) {
      const [r, g, b] = match.map(Number);
      const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      return `rgb(${grey},${grey},${grey})`;
    }
  }
  if (color.startsWith("hsla")) {
    return color.replace(
      /hsla\(([^,]+),\s*[^,]+,/,
      "hsla($1, 0%,"
    );
  }
  if (color.startsWith("hsl")) {
    return color.replace(
      /hsl\(([^,]+),\s*[^,]+,/,
      "hsl($1, 0%,"
    );
  }
  return color;
}

function processValue(value: unknown, colorFn: (c: string) => string): unknown {
  if (typeof value === "string" && isColorString(value)) {
    return colorFn(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => processValue(item, colorFn));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = processValue(v, colorFn);
    }
    return result;
  }
  return value;
}

function matchesPatterns(id: string, patterns: string[]): boolean {
  const lower = id.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

// Layers to hide entirely
const HIDDEN_LAYERS = [
  // POIs
  "poi_transit",
  "poi_r20",
  "poi_r7",
  "poi_r1",
  // Road labels & shields (we don't need street names)
  "highway-name-path",
  "highway-name-minor",
  "highway-name-major",
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  // One-way arrows
  "road_oneway",
  "road_oneway_opposite",
  // Rail hatching (visual noise, we draw our own lines)
  "road_major_rail_hatching",
  "road_transit_rail_hatching",
  "bridge_major_rail_hatching",
  "bridge_transit_rail_hatching",
  "tunnel_major_rail_hatching",
  "tunnel_transit_rail_hatching",
  // Base map rail lines (we draw our own)
  "road_major_rail",
  "road_transit_rail",
  "bridge_major_rail",
  "bridge_transit_rail",
  "tunnel_major_rail",
  "tunnel_transit_rail",
  // Buildings
  // (kept visible — zone layers are inserted above them)
  // Boundaries
  "boundary_3",
  "boundary_disputed",
  // Aeroway
  "aeroway_fill",
  "aeroway_runway",
  "aeroway_taxiway",
  "airport",
  // Minor labels
  "label_other",
  "label_state",
  "label_country_3",
  "label_country_2",
  "label_country_1",
  // Water labels (cluttery at city scale)
  "waterway_line_label",
  "water_name_line_label",
  "water_name_point_label",
  // Road area patterns
  "road_area_pattern",
  // Landuse fills that add noise
  "landuse_hospital",
  "landuse_school",
  "landuse_pitch",
  "landuse_track",
];

export async function loadGreyscaleStyle(
  styleUrl: string
): Promise<StyleSpecification> {
  const res = await fetch(styleUrl);
  const style: StyleSpecification = await res.json();

  for (const layer of style.layers) {
    const id = layer.id;

    // Hide map-level transit POIs (bus stops, station icons, etc.)
    if (HIDDEN_LAYERS.includes(id)) {
      if ("layout" in layer) {
        layer.layout = { ...layer.layout, visibility: "none" };
      } else {
        layer.layout = { visibility: "none" };
      }
      continue;
    }

    // Keep green/park layers as-is
    if (matchesPatterns(id, GREEN_PATTERNS)) continue;

    // Keep water layers as-is
    if (matchesPatterns(id, WATER_PATTERNS)) continue;

    // Greyscale everything else
    if ("paint" in layer && layer.paint) {
      layer.paint = processValue(layer.paint, toGreyscale) as typeof layer.paint;
    }
    
    if ("layout" in layer && layer.layout) {
      layer.layout = processValue(
        layer.layout,
        toGreyscale
      ) as typeof layer.layout;
    }
  }

  // Reorder: move water layers above roads/bridges so zone overlays can sit
  // between roads and water (order: buildings → roads → zones → water → labels)
  const waterIds = new Set(["water", "water-intermittent"]);
  const waterLayers = style.layers.filter((l) => waterIds.has(l.id));
  const otherLayers = style.layers.filter((l) => !waterIds.has(l.id));

  // Insert water after the last road/bridge/rail geometry layer (cablecar-dash)
  const cablecarIdx = otherLayers.findIndex((l) => l.id === "cablecar-dash");
  if (cablecarIdx !== -1) {
    otherLayers.splice(cablecarIdx + 1, 0, ...waterLayers);
    style.layers = otherLayers;
  }

  return style;
}
