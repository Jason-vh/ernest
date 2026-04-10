import { fetchTransitData, writeTransitData } from "./transit-data";

async function main() {
  const transitData = await fetchTransitData();
  await writeTransitData(undefined, transitData);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
