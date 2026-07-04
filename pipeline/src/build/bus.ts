import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listFeeds, fetchFeed, type GtfsFeedInfo } from "../sources/gtfs-jp";
import { parseCsv } from "./csv";
import { OUT_DIR } from "./util";

// 国交省GTFSデータリポジトリ(gtfs-data.jp)の全フィードからバス停・路線形状を生成
// 使い方: tsx src/build/bus.ts [--limit N]

const CONCURRENCY = 5;
const round = (v: number) => Math.round(v * 1e4) / 1e4; // 約11m精度

interface FeedResult {
  stops: GeoJSON.Feature[];
  shapes: GeoJSON.Feature[];
}

function readCsvIfExists(dir: string, name: string): Record<string, string>[] {
  const p = path.join(dir, name);
  return existsSync(p) ? parseCsv(readFileSync(p, "utf8")) : [];
}

function processFeed(feed: GtfsFeedInfo, dir: string): FeedResult {
  const org = feed.organization_name;
  const stops: GeoJSON.Feature[] = [];
  for (const s of readCsvIfExists(dir, "stops.txt")) {
    const lon = Number(s.stop_lon);
    const lat = Number(s.stop_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
    stops.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [round(lon), round(lat)] },
      properties: { stn: s.stop_name || null, op: org, mode: "bus" },
    });
  }

  // shape→route対応(trips.txt)と路線名(routes.txt)。路線ごとに代表shape 1本へ絞る
  const routes = new Map(readCsvIfExists(dir, "routes.txt").map((r) => [r.route_id, r]));
  const routeByShape = new Map<string, string>();
  for (const t of readCsvIfExists(dir, "trips.txt")) {
    if (t.shape_id && !routeByShape.has(t.shape_id)) routeByShape.set(t.shape_id, t.route_id);
  }

  const shapePoints = new Map<string, [number, number, number][]>();
  for (const p of readCsvIfExists(dir, "shapes.txt")) {
    const lon = Number(p.shape_pt_lon);
    const lat = Number(p.shape_pt_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    let arr = shapePoints.get(p.shape_id);
    if (!arr) {
      arr = [];
      shapePoints.set(p.shape_id, arr);
    }
    arr.push([Number(p.shape_pt_sequence), lon, lat]);
  }

  const bestShapeForRoute = new Map<string, { shapeId: string; count: number }>();
  for (const [shapeId, pts] of shapePoints) {
    const routeId = routeByShape.get(shapeId) ?? shapeId;
    const cur = bestShapeForRoute.get(routeId);
    if (!cur || pts.length > cur.count) bestShapeForRoute.set(routeId, { shapeId, count: pts.length });
  }

  const shapes: GeoJSON.Feature[] = [];
  for (const [routeId, { shapeId }] of bestShapeForRoute) {
    const pts = shapePoints
      .get(shapeId)!
      .sort((a, b) => a[0] - b[0])
      .map(([, lon, lat]) => [round(lon), round(lat)] as [number, number]);
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
        const { stops, shapes } = processFeed(feed, dir);
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
