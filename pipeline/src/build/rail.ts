import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchKsj, KSJ_URLS } from "../sources/ksj";
import { classifyRail } from "./classify";
import { findFile, mapshaper, OUT_DIR, ROOT } from "./util";

const TMP_DIR = path.join(ROOT, "data/raw/n02/tmp");

/** N02の属性を軽量なプロパティへ変換 */
function slimSections(geojsonPath: string, outPath: string) {
  const fc = JSON.parse(readFileSync(geojsonPath, "utf8"));
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const { mode } = classifyRail(String(p.N02_001 ?? ""), String(p.N02_002 ?? ""));
    f.properties = { n: p.N02_003 ?? null, op: p.N02_004 ?? null, mode };
  }
  writeFileSync(outPath, JSON.stringify(fc));
  console.log(`[rail] wrote ${outPath} (${fc.features.length} sections)`);
}

function slimStations(geojsonPath: string, outPath: string) {
  const fc = JSON.parse(readFileSync(geojsonPath, "utf8"));
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const { mode } = classifyRail(String(p.N02_001 ?? ""), String(p.N02_002 ?? ""));
    // 駅は線分で提供されるため中点1点に落とす
    if (f.geometry?.type === "LineString") {
      const coords = f.geometry.coordinates;
      f.geometry = { type: "Point", coordinates: coords[Math.floor(coords.length / 2)] };
    }
    f.properties = { stn: p.N02_005 ?? null, n: p.N02_003 ?? null, op: p.N02_004 ?? null, mode };
  }
  writeFileSync(outPath, JSON.stringify(fc));
  console.log(`[rail] wrote ${outPath} (${fc.features.length} stations)`);
}

async function main() {
  const dir = await fetchKsj("n02", KSJ_URLS.n02Rail);
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const sectionShp = findFile(dir, "RailroadSection", ".shp");
  const stationShp = findFile(dir, "Station", ".shp");

  const tmpSections = path.join(TMP_DIR, "sections.geojson");
  const tmpStations = path.join(TMP_DIR, "stations.geojson");

  // shift-jis 属性を考慮しつつGeoJSON化。路線は軽く簡略化+座標精度5桁(約1m)
  mapshaper([sectionShp, "-simplify", "12%", "keep-shapes", "-o", `precision=0.00001`, "format=geojson", tmpSections]);
  mapshaper([stationShp, "-o", `precision=0.00001`, "format=geojson", tmpStations]);

  slimSections(tmpSections, path.join(OUT_DIR, "rail-sections.geojson"));
  slimStations(tmpStations, path.join(OUT_DIR, "rail-stations.geojson"));
}

main();
