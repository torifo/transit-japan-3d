import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { listFeeds, fetchFeed, type GtfsFeedInfo } from "../sources/gtfs-jp";
import { parseCsv } from "./csv";
import { densifyAlongShape, gtfsTimeToSec, type SeqPoint } from "./timetable-util";
import { OUT_DIR } from "./util";

// 車両アニメーション用: フィードごとに trip の (時刻,座標) 列を集約したJSONを生成
// 出力: web/public/data/tt/<org>_<feed>.json と index.json(bbox付き)
// 使い方: tsx src/build/timetable.ts [--limit N]

const CONCURRENCY = 5;
const TT_DIR = path.join(OUT_DIR, "tt");
const round = (v: number) => Math.round(v * 1e4) / 1e4;

interface TripPoint {
  sec: number;
  lon: number;
  lat: number;
}

interface FeedIndexEntry {
  k: string;
  bbox: [number, number, number, number];
  trips: number;
}

function readCsvIfExists(dir: string, name: string): Record<string, string>[] {
  const p = path.join(dir, name);
  return existsSync(p) ? parseCsv(readFileSync(p, "utf8")) : [];
}

/** stop_times.txt を行ストリームで処理(クォート行のみparseCsvへフォールバック) */
async function streamStopTimes(
  file: string,
  onRow: (row: Record<string, string>) => void,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (let line of rl) {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") continue;
    if (!header) {
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      header = line.split(",").map((h) => h.trim());
      continue;
    }
    let values: string[];
    if (line.includes('"')) {
      const parsed = parseCsv(`${header.join(",")}\n${line}`);
      if (parsed.length === 0) continue;
      onRow(parsed[0]);
      continue;
    } else {
      values = line.split(",");
    }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = values[i] ?? "";
    onRow(row);
  }
}

async function processFeed(feed: GtfsFeedInfo, dir: string): Promise<FeedIndexEntry | null> {
  const stFile = path.join(dir, "stop_times.txt");
  if (!existsSync(stFile)) return null;

  const stopCoord = new Map<string, [number, number]>();
  for (const s of readCsvIfExists(dir, "stops.txt")) {
    const lon = Number(s.stop_lon);
    const lat = Number(s.stop_lat);
    if (Number.isFinite(lon) && Number.isFinite(lat) && lon >= 122 && lon <= 154 && lat >= 20 && lat <= 46) {
      stopCoord.set(s.stop_id, [round(lon), round(lat)]);
    }
  }
  const routes = new Map(readCsvIfExists(dir, "routes.txt").map((r) => [r.route_id, r]));
  const tripRoute = new Map<string, string>();
  const tripShape = new Map<string, string>();
  for (const t of readCsvIfExists(dir, "trips.txt")) {
    tripRoute.set(t.trip_id, t.route_id);
    if (t.shape_id) tripShape.set(t.trip_id, t.shape_id);
  }

  // shape_id → 順序付き点列(形状沿い補間用)
  const shapePoints = new Map<string, [number, number][]>();
  {
    const raw = new Map<string, [number, number, number][]>();
    for (const p of readCsvIfExists(dir, "shapes.txt")) {
      const seq = Number(p.shape_pt_sequence);
      const lon = Number(p.shape_pt_lon);
      const lat = Number(p.shape_pt_lat);
      if (!Number.isFinite(seq) || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      let arr = raw.get(p.shape_id);
      if (!arr) {
        arr = [];
        raw.set(p.shape_id, arr);
      }
      arr.push([seq, lon, lat]);
    }
    for (const [id, pts] of raw) {
      shapePoints.set(
        id,
        pts.sort((a, b) => a[0] - b[0]).map(([, lon, lat]) => [lon, lat] as [number, number]),
      );
    }
  }

  // trip_id → 時刻順の点列
  const tripPoints = new Map<string, TripPoint[]>();
  await streamStopTimes(stFile, (row) => {
    const sec = gtfsTimeToSec(row.departure_time || row.arrival_time || "");
    const coord = stopCoord.get(row.stop_id);
    if (sec == null || !coord) return;
    let arr = tripPoints.get(row.trip_id);
    if (!arr) {
      arr = [];
      tripPoints.set(row.trip_id, arr);
    }
    arr.push({ sec, lon: coord[0], lat: coord[1] });
  });

  const trips: [string, number, [number, number, number][]][] = [];
  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
  for (const [tripId, pts] of tripPoints) {
    if (pts.length < 2) continue;
    pts.sort((a, b) => a.sec - b.sec);
    const routeId = tripRoute.get(tripId);
    const r = routeId ? routes.get(routeId) : undefined;
    const name = r ? r.route_long_name || r.route_short_name || "" : "";
    const routeType = r ? Number(r.route_type) || 3 : 3;
    let seq: SeqPoint[] = pts.map((p) => [p.sec, p.lon, p.lat]);
    // 形状データがあれば停留所間を路線沿いの中間点で埋める(曲がり角のショートカット防止)
    const shape = tripShape.has(tripId) ? shapePoints.get(tripShape.get(tripId)!) : undefined;
    if (shape) {
      seq = densifyAlongShape(seq, shape).map(([t, lon, lat]) => [t, round(lon), round(lat)]);
    }
    for (const p of pts) {
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    }
    trips.push([name, routeType, seq]);
  }
  if (trips.length === 0) return null;

  const key = `${feed.organization_id}_${feed.feed_id}`;
  writeFileSync(path.join(TT_DIR, `${key}.json`), JSON.stringify({ op: feed.organization_name, trips }));
  return { k: key, bbox: [minLon, minLat, maxLon, maxLat], trips: trips.length };
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  mkdirSync(TT_DIR, { recursive: true });

  const feeds = (await listFeeds()).slice(0, limit);
  console.log(`[tt] processing ${feeds.length} feeds`);
  const index: FeedIndexEntry[] = [];
  let done = 0;
  let noTt = 0;

  const queue = [...feeds];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const feed = queue.shift();
      if (!feed) return;
      const dir = await fetchFeed(feed);
      done++;
      if (!dir) continue;
      try {
        const entry = await processFeed(feed, dir);
        if (entry) index.push(entry);
        else noTt++;
      } catch (e) {
        console.warn(`[tt] failed ${feed.organization_id}/${feed.feed_id}: ${(e as Error).message}`);
      }
      if (done % 50 === 0) console.log(`[tt] ${done}/${feeds.length}`);
    }
  });
  await Promise.all(workers);

  index.sort((a, b) => a.k.localeCompare(b.k));
  writeFileSync(path.join(TT_DIR, "index.json"), JSON.stringify(index));
  const totalTrips = index.reduce((s, e) => s + e.trips, 0);
  console.log(`[tt] wrote ${index.length} feed timetables (${totalTrips} trips, ${noTt} feeds without usable stop_times)`);
}

main();
