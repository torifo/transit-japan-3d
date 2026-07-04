import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchKsj, KSJ_URLS } from "../sources/ksj";
import { findFile, mapshaper, OUT_DIR, ROOT } from "./util";

// S10b-14 空港間流通量: S10b_001=出発空港 S10b_004=到着空港 S10b_007/008=年間旅客数(往/復)
// C28-21 空港: C28_005=空港名 (ポリゴン→内部点に変換)
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const s10bDir = await fetchKsj("s10b", KSJ_URLS.s10bAirFlow);
  const routeShp = findFile(s10bDir, "BetAport", ".shp");
  const tmpRoutes = path.join(ROOT, "data/raw/s10b/air.geojson");
  mapshaper(["-i", routeShp, "encoding=shift-jis", "-o", "precision=0.0001", "format=geojson", tmpRoutes]);

  const routes = JSON.parse(readFileSync(tmpRoutes, "utf8"));
  routes.features = routes.features.filter((f: GeoJSON.Feature) => {
    const p = f.properties as Record<string, unknown> | null;
    return f.geometry?.type === "LineString" && p?.S10b_001 && p?.S10b_004;
  });
  // 国際線は空港名が「国名(都市)」形式(国内空港名に括弧は無い)
  const isIntl = (name: unknown) => /[(（]/.test(String(name ?? ""));
  for (const f of routes.features) {
    const p = f.properties ?? {};
    const pax = (Number(p.S10b_007) || 0) + (Number(p.S10b_008) || 0);
    const intl = isIntl(p.S10b_001) || isIntl(p.S10b_004);
    f.properties = { n: `${p.S10b_001}〜${p.S10b_004}`, op: null, mode: "air", pax, intl };
  }
  const outRoutes = path.join(OUT_DIR, "air-routes.geojson");
  writeFileSync(outRoutes, JSON.stringify(routes));
  console.log(`[air] wrote ${outRoutes} (${routes.features.length} routes)`);

  const c28Dir = await fetchKsj("c28", KSJ_URLS.c28Airports);
  const airportSrc = findFile(path.join(c28Dir, "UTF-8"), "C28-21_Airport", ".geojson");
  const tmpAirports = path.join(ROOT, "data/raw/c28/airports.geojson");
  // ポリゴン→内部点。同名空港(滑走路別ポリゴン等)は1点に集約
  mapshaper(["-i", airportSrc, "-points", "inner", "-o", "precision=0.0001", "format=geojson", tmpAirports]);
  const ap = JSON.parse(readFileSync(tmpAirports, "utf8"));
  const seen = new Set<string>();
  ap.features = ap.features.filter((f: GeoJSON.Feature) => {
    const name = (f.properties as Record<string, unknown>)?.C28_005 as string | undefined;
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  for (const f of ap.features) {
    const p = f.properties ?? {};
    f.properties = { stn: p.C28_005 ?? null, n: null, op: p.C28_004 ?? null, mode: "air" };
  }
  const outAirports = path.join(OUT_DIR, "airports.geojson");
  writeFileSync(outAirports, JSON.stringify(ap));
  console.log(`[air] wrote ${outAirports} (${ap.features.length} airports)`);
}

main();
