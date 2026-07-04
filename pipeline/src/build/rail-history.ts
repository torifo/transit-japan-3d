import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchKsj, KSJ_URLS } from "../sources/ksj";
import { findFile, mapshaper, OUT_DIR, ROOT } from "./util";

// 国土数値情報 N05-24 鉄道時系列(1950年以降)
// N05_002=路線名 N05_003=事業者名 N05_005b=設置期間開始年 N05_005e=終了年(9999=現存) N05_011=駅名
const int = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n !== 9999 ? n : null;
};

function slim(fc: GeoJSON.FeatureCollection, isStation: boolean) {
  fc.features = fc.features.filter((f) => f.geometry);
  for (const f of fc.features) {
    const p = f.properties as Record<string, unknown>;
    f.properties = {
      ...(isStation ? { stn: p.N05_011 ?? null } : {}),
      n: p.N05_002 ?? null,
      op: p.N05_003 ?? null,
      from: int(p.N05_005b),
      to: int(p.N05_005e),
      mode: "rail",
    };
  }
  return fc;
}

async function main() {
  const dir = await fetchKsj("n05", KSJ_URLS.n05RailTimeSeries);
  mkdirSync(OUT_DIR, { recursive: true });

  const sectionShp = findFile(dir, "RailroadSection2", ".shp");
  const tmp = path.join(ROOT, "data/raw/n05/sections.geojson");
  mapshaper(["-i", sectionShp, "-simplify", "12%", "keep-shapes", "-o", "precision=0.00001", "format=geojson", tmp]);
  const sections = slim(JSON.parse(readFileSync(tmp, "utf8")), false);
  const outS = path.join(OUT_DIR, "rail-history-sections.geojson");
  writeFileSync(outS, JSON.stringify(sections));
  console.log(`[rail-history] wrote ${outS} (${sections.features.length} sections)`);

  const stationSrc = findFile(dir, "Station2", ".geojson");
  const stations = slim(JSON.parse(readFileSync(stationSrc, "utf8")), true);
  for (const f of stations.features) {
    if (f.geometry.type === "Point") {
      const c = (f.geometry as GeoJSON.Point).coordinates;
      (f.geometry as GeoJSON.Point).coordinates = [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
    }
  }
  const outT = path.join(OUT_DIR, "rail-history-stations.geojson");
  writeFileSync(outT, JSON.stringify(stations));
  console.log(`[rail-history] wrote ${outT} (${stations.features.length} stations)`);
}

main();
