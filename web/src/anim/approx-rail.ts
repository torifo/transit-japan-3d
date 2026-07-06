import type maplibregl from "maplibre-gl";
import type { Vehicle } from "./vehicles";

// GTFS未提供の鉄道(JR・大手私鉄等)向けの近似運行アニメ。
// N02区間(rail-sections)を路線単位に連結し、モード別の想定速度・運転間隔で
// 定常運行(往復ピンポン)する列車位置を毎tick手続き的に計算する。
// 実ダイヤではないため op に (近似運行) を付けて表示する。

interface ModeParam {
  speedKmh: number;
  headwaySec: number;
  /** このズーム未満では描画しない(俯瞰時の氾濫防止)。新幹線のみ全国俯瞰でも出す */
  minZoom: number;
  routeType: number; // アイコン選択用(icons.ts のroute_type)
}

const MODE_PARAMS: Record<string, ModeParam> = {
  shinkansen: { speedKmh: 220, headwaySec: 15 * 60, minZoom: 0, routeType: 2 },
  jr: { speedKmh: 60, headwaySec: 20 * 60, minZoom: 8, routeType: 2 },
  rail: { speedKmh: 55, headwaySec: 15 * 60, minZoom: 8, routeType: 2 },
  tram: { speedKmh: 25, headwaySec: 8 * 60, minZoom: 8, routeType: 0 },
  monorail: { speedKmh: 40, headwaySec: 10 * 60, minZoom: 8, routeType: 1 },
  cable: { speedKmh: 15, headwaySec: 20 * 60, minZoom: 8, routeType: 0 },
};

const SERVICE_START = 5 * 3600;
const SERVICE_END = 24.5 * 3600;
const JOIN_KM = 0.15; // 区間端点をこの距離以内なら同一路線として連結
const MIN_CHAIN_KM = 1;

interface Chain {
  name: string;
  op: string;
  mode: string;
  coords: [number, number][];
  cum: number[]; // 各頂点までの累積距離(km)
  lenKm: number;
  bbox: [number, number, number, number];
}

function distKm(a: [number, number], b: [number, number]): number {
  const ky = 111.32;
  const kx = ky * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
}

/** 端点の近い区間同士を貪欲に連結して路線ポリライン群を作る */
function chainSegments(segments: [number, number][][]): [number, number][][] {
  const pool = segments.filter((s) => s.length >= 2);
  const chains: [number, number][][] = [];
  while (pool.length > 0) {
    let chain = pool.pop()!.slice();
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (distKm(tail, seg[0]) < JOIN_KM) chain = chain.concat(seg.slice(1));
        else if (distKm(tail, seg[seg.length - 1]) < JOIN_KM) chain = chain.concat(seg.slice(0, -1).reverse());
        else if (distKm(head, seg[seg.length - 1]) < JOIN_KM) chain = seg.slice(0, -1).concat(chain);
        else if (distKm(head, seg[0]) < JOIN_KM) chain = seg.slice(1).reverse().concat(chain);
        else continue;
        pool.splice(i, 1);
        extended = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

export class ApproxRail {
  private chains: Chain[] = [];
  private built = false;

  /** rail-sections(N02現況)から路線チェーンを構築する。重いので初回のみ */
  build(railSections: GeoJSON.FeatureCollection): void {
    if (this.built) return;
    this.built = true;
    const groups = new Map<string, { mode: string; name: string; op: string; segs: [number, number][][] }>();
    for (const f of railSections.features) {
      if (f.geometry?.type !== "LineString") continue;
      const p = f.properties as { n?: string; op?: string; mode?: string };
      const mode = p?.mode ?? "rail";
      if (!MODE_PARAMS[mode]) continue;
      const key = `${p?.op ?? ""}|${p?.n ?? ""}|${mode}`;
      let g = groups.get(key);
      if (!g) {
        g = { mode, name: p?.n ?? "(路線名なし)", op: p?.op ?? "", segs: [] };
        groups.set(key, g);
      }
      g.segs.push((f.geometry as GeoJSON.LineString).coordinates as [number, number][]);
    }
    for (const g of groups.values()) {
      for (const coords of chainSegments(g.segs)) {
        const cum: number[] = [0];
        for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distKm(coords[i - 1], coords[i]));
        const lenKm = cum[cum.length - 1];
        if (lenKm < MIN_CHAIN_KM) continue;
        let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
        for (const [lon, lat] of coords) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        this.chains.push({ name: g.name, op: g.op, mode: g.mode, coords, cum, lenKm, bbox: [minLon, minLat, maxLon, maxLat] });
      }
    }
  }

  /** 累積距離→座標(二分探索+線形補間) */
  private pointAt(c: Chain, km: number): [number, number] {
    let lo = 0, hi = c.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c.cum[mid] < km) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = c.cum[i] - c.cum[i - 1];
    const f = span > 0 ? (km - c.cum[i - 1]) / span : 0;
    const [x0, y0] = c.coords[i - 1];
    const [x1, y1] = c.coords[i];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  }

  /** 現在時刻の近似列車一覧(viewport内・ズーム条件を満たす路線のみ)。routeで単一路線に絞れる */
  tick(clockSec: number, map: maplibregl.Map, route: { n: string; op: string } | null = null): Vehicle[] {
    // クロックは0〜30時(深夜帯含む)。5:00前・24:30以降は運行なし
    if (clockSec < SERVICE_START || clockSec > SERVICE_END) return [];
    const sec = clockSec;
    const zoom = map.getZoom();
    const b = map.getBounds();
    const out: Vehicle[] = [];
    for (const c of this.chains) {
      if (route && (c.name !== route.n || c.op !== route.op)) continue;
      const prm = MODE_PARAMS[c.mode];
      if (!route && zoom < prm.minZoom) continue;
      if (c.bbox[0] > b.getEast() || c.bbox[2] < b.getWest() || c.bbox[1] > b.getNorth() || c.bbox[3] < b.getSouth())
        continue;
      const vKmSec = prm.speedKmh / 3600;
      const period = (2 * c.lenKm) / vKmSec; // 往復周期(秒)
      const nTrains = Math.max(1, Math.floor(period / prm.headwaySec));
      for (let k = 0; k < nTrains; k++) {
        let s = ((sec - k * prm.headwaySec) * vKmSec) % (2 * c.lenKm);
        if (s < 0) s += 2 * c.lenKm;
        const km = s < c.lenKm ? s : 2 * c.lenKm - s;
        out.push({
          position: this.pointAt(c, km),
          routeType: prm.routeType,
          name: c.name,
          op: `${c.op} (近似運行)`,
        });
      }
    }
    return out;
  }
}
