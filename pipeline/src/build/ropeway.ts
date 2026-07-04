import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { overpass } from "../sources/overpass";
import { OUT_DIR } from "./util";

// OSMから日本国内の旅客索道(ロープウェイ・ゴンドラ等)を取得
// chair_lift/drag_liftはスキー場リフトが大半なので除外
const QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="JP"][admin_level=2]->.jp;
way(area.jp)["aerialway"~"^(cable_car|gondola|mixed_lift|zip_line|funicular)$"];
out geom;
`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const res = await overpass(QUERY);
  const features: GeoJSON.Feature[] = res.elements
    .filter((e) => e.type === "way" && e.geometry && e.geometry.length >= 2)
    .map((e) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: e.geometry!.map((g) => [Math.round(g.lon * 1e5) / 1e5, Math.round(g.lat * 1e5) / 1e5]),
      },
      properties: {
        n: e.tags?.name ?? e.tags?.["name:ja"] ?? null,
        op: e.tags?.operator ?? null,
        mode: "ropeway",
        kind: e.tags?.aerialway ?? null,
      },
    }));
  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const out = path.join(OUT_DIR, "ropeways.geojson");
  writeFileSync(out, JSON.stringify(fc));
  console.log(`[ropeway] wrote ${out} (${features.length} ways)`);
}

main();
