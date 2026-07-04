import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listFeeds, fetchFeed } from "../sources/gtfs-jp";
import { listExtraFeeds } from "../sources/extra-gtfs";
import { parseCsv } from "./csv";
import { OUT_DIR } from "./util";

// 国交省GTFSデータリポジトリ(gtfs-data.jp)の全フィードからバス停・路線形状を生成
// 使い方: tsx src/build/bus.ts [--limit N]

const CONCURRENCY = 5;
const round = (v: number) => Math.round(v * 1e4) / 1e4; // 約11m精度

// 空文字は Number() で 0 になり日本外の点として混入するため、日本近傍bboxで検証する
function parseJpCoord(lonRaw: string, latRaw: string): [number, number] | null {
  if (!lonRaw || !latRaw) return null;
  const lon = Number(lonRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < 122 || lon > 154 || lat < 20 || lat > 46) return null;
  return [round(lon), round(lat)];
}

// GTFS route_type のうちバス系のみ採用(3=バス, 11=トロリーバス, 700-799=拡張バス)
function isBusRouteType(t: string): boolean {
  if (t === "" || t === "3" || t === "11") return true;
  const n = Number(t);
  return Number.isFinite(n) && n >= 700 && n <= 799;
}

interface FeedResult {
  stops: GeoJSON.Feature[];
  shapes: GeoJSON.Feature[];
}

function readCsvIfExists(dir: string, name: string): Record<string, string>[] {
  const p = path.join(dir, name);
  return existsSync(p) ? parseCsv(readFileSync(p, "utf8")) : [];
}

function processFeed(org: string, dir: string): FeedResult {
  const stops: GeoJSON.Feature[] = [];
  for (const s of readCsvIfExists(dir, "stops.txt")) {
    // 駅構造体(location_type=1)や入口(2)等は除外し、乗降可能な停留所のみ
    if (s.location_type && s.location_type !== "0") continue;
    const coord = parseJpCoord(s.stop_lon, s.stop_lat);
    if (!coord) continue;
    stops.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: { stn: s.stop_name || null, op: org, mode: "bus" },
    });
  }

  // shape→route対応(trips.txt)と路線名(routes.txt)。バス系route_typeのみ・路線ごとに代表shape 1本
  const routes = new Map(
    readCsvIfExists(dir, "routes.txt")
      .filter((r) => isBusRouteType(r.route_type ?? ""))
      .map((r) => [r.route_id, r]),
  );
  const routeByShape = new Map<string, string>();
  for (const t of readCsvIfExists(dir, "trips.txt")) {
    if (t.shape_id && routes.has(t.route_id) && !routeByShape.has(t.shape_id)) {
      routeByShape.set(t.shape_id, t.route_id);
    }
  }

  const shapePoints = new Map<string, [number, number, number][]>();
  for (const p of readCsvIfExists(dir, "shapes.txt")) {
    const seq = Number(p.shape_pt_sequence);
    const coord = parseJpCoord(p.shape_pt_lon, p.shape_pt_lat);
    if (!coord || !Number.isFinite(seq)) continue;
    let arr = shapePoints.get(p.shape_id);
    if (!arr) {
      arr = [];
      shapePoints.set(p.shape_id, arr);
    }
    arr.push([seq, coord[0], coord[1]]);
  }

  const hasTrips = routeByShape.size > 0;
  const bestShapeForRoute = new Map<string, { shapeId: string; count: number }>();
  for (const [shapeId, pts] of shapePoints) {
    // trips.txtがある場合はバス系routeに紐づくshapeのみ採用
    const routeId = routeByShape.get(shapeId) ?? (hasTrips ? null : shapeId);
    if (routeId == null) continue;
    const cur = bestShapeForRoute.get(routeId);
    if (!cur || pts.length > cur.count) bestShapeForRoute.set(routeId, { shapeId, count: pts.length });
  }

  const shapes: GeoJSON.Feature[] = [];
  for (const [routeId, { shapeId }] of bestShapeForRoute) {
    const pts = shapePoints
      .get(shapeId)!
      .sort((a, b) => a[0] - b[0])
      .map(([, lon, lat]) => [lon, lat] as [number, number]);
    // 単純間引き: 端点を残し2点ごと
    const thinned = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
    if (thinned.length < 2) continue;
    const r = routes.get(routeId);
    const name = r ? r.route_long_name || r.route_short_name || null : null;
    shapes.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: thinned },
      properties: { n: name, op: org, mode: "bus" },
    });
  }
  return { stops, shapes };
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  mkdirSync(OUT_DIR, { recursive: true });
  const feeds = (await listFeeds()).slice(0, limit);
  console.log(`[bus] processing ${feeds.length} feeds (concurrency ${CONCURRENCY})`);

  const allStops: GeoJSON.Feature[] = [];
  const allShapes: GeoJSON.Feature[] = [];
  let done = 0;
  let skipped = 0;
  let noShapes = 0;

  const queue = [...feeds];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const feed = queue.shift();
      if (!feed) return;
      const dir = await fetchFeed(feed);
      done++;
      if (!dir) {
        skipped++;
        continue;
      }
      try {
        const { stops, shapes } = processFeed(feed.organization_name, dir);
        if (shapes.length === 0) noShapes++;
        allStops.push(...stops);
        allShapes.push(...shapes);
      } catch (e) {
        skipped++;
        console.warn(`[bus] process failed ${feed.organization_id}/${feed.feed_id}: ${(e as Error).message}`);
      }
      if (done % 25 === 0) console.log(`[bus] ${done}/${feeds.length} feeds (stops=${allStops.length} shapes=${allShapes.length})`);
    }
  });
  await Promise.all(workers);

  // gtfs-data.jp に無い事業者の手動配置フィード(data/raw/extra-gtfs/*.zip)
  for (const extra of listExtraFeeds()) {
    try {
      const { stops, shapes } = processFeed(extra.organizationName, extra.dir);
      allStops.push(...stops);
      allShapes.push(...shapes);
      console.log(`[bus] extra feed ${extra.organizationName}: stops=${stops.length} shapes=${shapes.length}`);
    } catch (e) {
      console.warn(`[bus] extra feed failed ${extra.organizationName}: ${(e as Error).message}`);
    }
  }

  writeFileSync(
    path.join(OUT_DIR, "bus-stops.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: allStops }),
  );
  writeFileSync(
    path.join(OUT_DIR, "bus-routes.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: allShapes }),
  );
  console.log(
    `[bus] wrote ${allStops.length} stops, ${allShapes.length} route shapes ` +
      `(feeds: ${done - skipped} ok, ${skipped} skipped, ${noShapes} without shapes.txt)`,
  );
}

main();
