import { IconLayer } from "@deck.gl/layers";
import { vehicleIcon } from "./icons";
import type { Layer } from "@deck.gl/core";
import type maplibregl from "maplibre-gl";

// GTFS時刻表(pipeline/build/timetable.ts の出力)を補間して現在時刻の車両位置を描く

interface FeedIndexEntry {
  k: string;
  bbox: [number, number, number, number];
  trips: number;
  /** このズーム以上でロード(省略時はMIN_ZOOM)。近似ダイヤの船・飛行機は0 */
  z?: number;
}

/** [sec, lon, lat] の列 */
type TripSeq = [number, number, number][];
/** [路線名, route_type, 点列] */
type Trip = [string, number, TripSeq];

interface LoadedFeed {
  op: string;
  trips: Trip[];
}

interface Vehicle {
  position: [number, number];
  routeType: number;
  name: string;
  op: string;
}

const MAX_LOADED_FEEDS = 60;
const MIN_ZOOM = 8.5;

// 表示アイコンは icons.ts (route_type別の乗り物グリフ) を参照

export class VehicleAnimator {
  private index: FeedIndexEntry[] = [];
  private loaded = new Map<string, LoadedFeed>();
  private loading = new Set<string>();
  /** 実時間に対する倍速。0で一時停止 */
  speed = 1;
  /** 深夜0時起点の表示時刻(秒)。JSTの現在時刻で初期化 */
  clockSec: number;
  private lastTick = performance.now();

  constructor() {
    const now = new Date();
    this.clockSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  }

  async init(): Promise<boolean> {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/tt/index.json`);
      if (!r.ok) return false;
      this.index = await r.json();
      return true;
    } catch {
      return false;
    }
  }

  /** 表示中のviewportに交差するフィードを遅延ロード */
  syncViewport(map: maplibregl.Map): void {
    const zoom = map.getZoom();
    const b = map.getBounds();
    const want = this.index.filter(
      (e) =>
        zoom >= (e.z ?? MIN_ZOOM) &&
        e.bbox[0] <= b.getEast() && e.bbox[2] >= b.getWest() && e.bbox[1] <= b.getNorth() && e.bbox[3] >= b.getSouth(),
    );
    for (const e of want) {
      if (this.loaded.has(e.k) || this.loading.has(e.k)) continue;
      if (this.loaded.size >= MAX_LOADED_FEEDS) break;
      this.loading.add(e.k);
      fetch(`${import.meta.env.BASE_URL}data/tt/${e.k}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) this.loaded.set(e.k, json);
        })
        .catch(() => undefined)
        .finally(() => this.loading.delete(e.k));
    }
  }

  /** クロックを進めて現在位置の車両一覧を返す */
  tick(): Vehicle[] {
    const now = performance.now();
    this.clockSec += ((now - this.lastTick) / 1000) * this.speed;
    if (this.clockSec > 30 * 3600) this.clockSec -= 24 * 3600; // 深夜帯を一巡したら翌日へ
    this.lastTick = now;

    const sec = this.clockSec;
    const vehicles: Vehicle[] = [];
    for (const feed of this.loaded.values()) {
      for (const [name, routeType, seq] of feed.trips) {
        const first = seq[0][0];
        const last = seq[seq.length - 1][0];
        if (sec < first || sec > last) continue;
        // 現在秒を挟む区間を線形補間
        for (let i = 1; i < seq.length; i++) {
          if (seq[i][0] >= sec) {
            const [t0, x0, y0] = seq[i - 1];
            const [t1, x1, y1] = seq[i];
            const f = t1 === t0 ? 0 : (sec - t0) / (t1 - t0);
            vehicles.push({
              position: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f],
              routeType,
              name,
              op: feed.op,
            });
            break;
          }
        }
      }
    }
    return vehicles;
  }

  buildLayer(vehicles: Vehicle[], onHover: (info: { object?: unknown; x: number; y: number }) => void): Layer {
    return new IconLayer<Vehicle>({
      id: "vehicles",
      data: vehicles,
      getPosition: (d) => d.position,
      getIcon: (d) => vehicleIcon(d.routeType),
      sizeUnits: "pixels",
      getSize: 18,
      sizeMinPixels: 12,
      sizeMaxPixels: 28,
      pickable: true,
      onHover,
    });
  }

  get loadedCount(): number {
    return this.loaded.size;
  }
}
