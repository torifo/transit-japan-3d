import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchKsj, KSJ_URLS } from "../sources/ksj";
import { findFile, mapshaper, OUT_DIR, ROOT } from "./util";

// 国土数値情報 N09-12 定期旅客航路
// N09_006=航路名 N09_009=事業者名 N09_024=所要時間(分) N09_025=距離?
async function main() {
  const dir = await fetchKsj("n09", KSJ_URLS.n09FerryRoutes);
  mkdirSync(OUT_DIR, { recursive: true });
  const shp = findFile(dir, "N09-12_l", ".shp");
  const tmp = path.join(ROOT, "data/raw/n09/ferry.geojson");
  mapshaper(["-i", shp, "-o", "precision=0.0001", "format=geojson", tmp]);

  const fc = JSON.parse(readFileSync(tmp, "utf8"));
  for (const f of fc.features) {
    const p = f.properties ?? {};
    f.properties = { n: p.N09_006 ?? null, op: p.N09_009 ?? null, mode: "ferry" };
  }
  const out = path.join(OUT_DIR, "ferry-routes.geojson");
  writeFileSync(out, JSON.stringify(fc));
  console.log(`[ferry] wrote ${out} (${fc.features.length} routes)`);
}

main();
