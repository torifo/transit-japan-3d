import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./util";

// 近似ダイヤ生成: 時刻表が公開されていない航路(N09)と空路(S10b)に、
// 想定速度・便数から合成した「近似ダイヤ」を与えて車両アニメに載せる。
// 実ダイヤではないため op に (近似ダイヤ) を明記する。
// 出力: web/public/data/tt/approx-{ferry,air}.json (index.json は timetable.ts が
// 書いた既存indexへ追記マージ)
// 使い方: tsx src/build/timetable-approx.ts (ferry.ts / air.ts 実行後)

const TT_DIR = path.join(OUT_DIR, "tt");
const round = (v: number) => Math.round(v * 1e4) / 1e4;

type Seq = [number, number, number][]; // [sec, lon, lat]
type Trip = [string, number, Seq];

interface IndexEntry {
  k: string;
  bbox: [number, number, number, number];
  trips: number;
  /** このズーム以上でロード(省略時はクライアント既定の8.5) */
  z?: number;
}

function distKm(lon0: number, lat0: number, lon1: number, lat1: number): number {
  const ky = 111.32;
  const kx = ky * Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180));
  return Math.hypot((lon1 - lon0) * kx, (lat1 - lat0) * ky);
}

function lineLengthKm(coords: [number, number][]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return sum;
}

/** 出発時刻から線形速度で経路をなぞる点列(往路)。reverse=trueで復路 */
function tripAlong(coords: [number, number][], departSec: number, speedKmh: number, reverse: boolean): Seq {
  const pts = reverse ? [...coords].reverse() : coords;
  const seq: Seq = [[Math.round(departSec), round(pts[0][0]), round(pts[0][1])]];
  let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    cum += distKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    seq.push([Math.round(departSec + (cum / speedKmh) * 3600), round(pts[i][0]), round(pts[i][1])]);
  }
  return seq;
}

function bboxOf(trips: Trip[]): [number, number, number, number] {
  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
  for (const [, , seq] of trips) {
    for (const [, lon, lat] of seq) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function loadGeojson(name: string): GeoJSON.FeatureCollection | null {
  const p = path.join(OUT_DIR, `${name}.geojson`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

// --- 航路: 20kt(約37km/h)・6:00〜21:00に3時間毎の往復便と仮定 ---
function buildFerry(): Trip[] {
  const fc = loadGeojson("ferry-routes");
  if (!fc) return [];
  const SPEED = 37;
  const trips: Trip[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "LineString") continue;
    const coords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
    if (coords.length < 2) continue;
    const name = ((f.properties as { n?: string })?.n ?? "") + "";
    const lenKm = lineLengthKm(coords);
    if (lenKm < 1) continue;
    // 長距離航路(>200km)は1日1往復、それ以外は3時間毎
    const headway = lenKm > 200 ? 24 * 3600 : 3 * 3600;
    for (let dep = 6 * 3600; dep <= 21 * 3600; dep += headway) {
      trips.push([name, 4, tripAlong(coords, dep, SPEED, false)]);
      trips.push([name, 4, tripAlong(coords, dep + 30 * 60, SPEED, true)]);
    }
  }
  return trips;
}

// --- 空路: 巡航750km/h・年間旅客数から1日の便数を推定(150席×搭乗率70%) ---
function buildAir(): Trip[] {
  const fc = loadGeojson("air-routes");
  if (!fc) return [];
  const SPEED = 750;
  const trips: Trip[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "LineString") continue;
    const p = f.properties as { n?: string; pax?: number; intl?: boolean };
    if (p?.intl) continue; // 国内線のみ(表示方針に合わせる)
    const coords = (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
    if (coords.length < 2) continue;
    const pax = p?.pax ?? 0;
    // 年間旅客数 → 片道あたりの1日便数(最大12便に丸め)
    const daily = Math.min(12, Math.max(pax > 0 ? 1 : 0, Math.round(pax / 365 / (150 * 0.7) / 2)));
    if (daily === 0) continue;
    const name = (p?.n ?? "") + "";
    // 7:00〜20:00に等間隔で往復便を配置
    const window = 13 * 3600;
    for (let i = 0; i < daily; i++) {
      const dep = 7 * 3600 + Math.round((window * i) / Math.max(1, daily - 1 || 1));
      trips.push([name, 1101, tripAlong(coords, dep, SPEED, false)]);
      trips.push([name, 1101, tripAlong(coords, dep + 45 * 60, SPEED, true)]);
    }
  }
  return trips;
}

function writeFeed(key: string, op: string, trips: Trip[], index: IndexEntry[]) {
  if (trips.length === 0) return;
  writeFileSync(path.join(TT_DIR, `${key}.json`), JSON.stringify({ op, trips }));
  // 船・飛行機は俯瞰スケールでも見えるようズーム制限なしでロードさせる
  const entry: IndexEntry = { k: key, bbox: bboxOf(trips), trips: trips.length, z: 0 };
  const i = index.findIndex((e) => e.k === key);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  console.log(`[tt-approx] ${key}: ${trips.length} trips`);
}

function main() {
  mkdirSync(TT_DIR, { recursive: true });
  const indexPath = path.join(TT_DIR, "index.json");
  const index: IndexEntry[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];

  writeFeed("approx-ferry", "航路 (近似ダイヤ)", buildFerry(), index);
  writeFeed("approx-air", "国内空路 (近似ダイヤ)", buildAir(), index);

  index.sort((a, b) => a.k.localeCompare(b.k));
  writeFileSync(indexPath, JSON.stringify(index));
  console.log(`[tt-approx] index updated (${index.length} feeds)`);
}

main();
