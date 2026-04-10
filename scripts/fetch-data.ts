import path from "path";
import { fetchTransitData, writeTransitData } from "./transit-data";

interface BuurtStats {
  wozValue: number | null;
  ownerOccupiedPct: number | null;
  safetyRating: number | null;
  crimesPer1000: number | null;
}

const BBGA_INDICATORS = [
  { id: "WWOZ_GEM", key: "wozValue" },
  { id: "WKOOP_P", key: "ownerOccupiedPct" },
  { id: "VBUURTVEILIG_R", key: "safetyRating" },
  { id: "VMISDRIJF_1000INW", key: "crimesPer1000" },
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuurten(): Promise<GeoJSON.FeatureCollection> {
  console.log("Fetching Amsterdam buurt boundaries...");
  const allFeatures: GeoJSON.Feature[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.data.amsterdam.nl/v1/gebieden/buurten?_format=geojson&_pageSize=200&page=${page}`;
    console.log(`  Page ${page}...`);
    const res = await fetch(url);
    if (res.status === 404) break;
    if (!res.ok) {
      throw new Error(`Amsterdam buurten API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    if (features.length === 0) break;
    allFeatures.push(...features);
    page++;
    await sleep(1000);
  }

  console.log(`  Fetched ${allFeatures.length} buurten total`);
  return { type: "FeatureCollection", features: allFeatures };
}

async function fetchBuurtStats(): Promise<Map<string, BuurtStats>> {
  console.log("Fetching BBGA neighbourhood statistics...");
  const stats = new Map<string, BuurtStats>();

  for (const indicator of BBGA_INDICATORS) {
    for (const jaar of [2024, 2023]) {
      let page = 1;
      let foundData = false;

      while (true) {
        const url = `https://api.data.amsterdam.nl/v1/bbga/kerncijfers/?_format=json&_pageSize=200&indicatorDefinitieId=${indicator.id}&jaar=${jaar}&page=${page}`;
        console.log(`  ${indicator.id} year=${jaar} page=${page}...`);
        const res = await fetch(url);
        if (res.status === 404) break;
        if (!res.ok) {
          console.warn(`  API error for ${indicator.id}: ${res.status}`);
          break;
        }
        const data = await res.json();
        const results = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data._embedded?.kerncijfers)
            ? data._embedded.kerncijfers
            : [];
        if (results.length === 0) break;
        foundData = true;

        for (const row of results) {
          const code = typeof row.gebiedcode15 === "string" ? row.gebiedcode15 : null;
          const value = row.waarde;
          if (!code || value == null) continue;

          if (!stats.has(code)) {
            stats.set(code, {
              wozValue: null,
              ownerOccupiedPct: null,
              safetyRating: null,
              crimesPer1000: null,
            });
          }

          const entry = stats.get(code);
          if (!entry) continue;
          entry[indicator.key] = Number(value);
        }

        if (!data._links?.next) break;
        page++;
        await sleep(1000);
      }

      if (foundData) {
        console.log(`  ${indicator.id}: using year ${jaar}`);
        break;
      }
    }
  }

  console.log(`  Stats collected for ${stats.size} gebieden`);
  return stats;
}

function filterAndMergeBuurten(
  buurten: GeoJSON.FeatureCollection,
  stats: Map<string, BuurtStats>,
): GeoJSON.FeatureCollection {
  console.log("Merging stats into buurten...");

  const filtered: GeoJSON.Feature[] = [];
  let idCounter = 1;

  for (const buurt of buurten.features) {
    const props =
      typeof buurt.properties === "object" && buurt.properties !== null ? buurt.properties : {};
    const code = typeof props.code === "string" ? props.code : "";
    const name =
      typeof props.naam === "string"
        ? props.naam
        : typeof props.name === "string"
          ? props.name
          : "";
    const buurtStats = stats.get(code);

    filtered.push({
      ...buurt,
      id: idCounter++,
      properties: {
        code,
        name,
        wozValue: buurtStats?.wozValue ?? null,
        ownerOccupiedPct: buurtStats?.ownerOccupiedPct ?? null,
        safetyRating: buurtStats?.safetyRating ?? null,
        crimesPer1000: buurtStats?.crimesPer1000 ?? null,
      },
    });
  }

  console.log(`  ${filtered.length} buurten processed`);
  return { type: "FeatureCollection", features: filtered };
}

async function main() {
  console.log("\nFetching transit data and neighbourhood data...");
  await sleep(2000);

  const outputDir = path.resolve(import.meta.dir, "../packages/backend/data");
  const [transitData, buurten, buurtStats] = await Promise.all([
    fetchTransitData(),
    fetchBuurten(),
    fetchBuurtStats(),
  ]);

  const filteredBuurten = filterAndMergeBuurten(buurten, buurtStats);

  await Promise.all([
    writeTransitData(outputDir, transitData),
    Bun.write(path.join(outputDir, "buurten.geojson"), JSON.stringify(filteredBuurten, null, 2)),
  ]);

  console.log(`\nData written to ${outputDir}/`);
  console.log("  - stations.json");
  console.log("  - lines.geojson");
  console.log("  - buurten.geojson");

  const tramCount = transitData.stations.filter((station) => station.type === "tram").length;
  const metroCount = transitData.stations.filter((station) => station.type === "metro").length;
  const trainCount = transitData.stations.filter((station) => station.type === "train").length;
  console.log(
    `\nTransit summary: ${tramCount} tram, ${metroCount} metro, ${trainCount} train stops`,
  );
  console.log(`Neighbourhoods: ${filteredBuurten.features.length} buurten processed`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
