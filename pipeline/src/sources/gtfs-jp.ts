import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, renameSync, rmSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { ROOT } from "../build/util";

const FILES_API = "https://api.gtfs-data.jp/v2/files";
const GTFS_DIR = path.join(ROOT, "data/raw/gtfs-jp");

export interface GtfsFeedInfo {
  organization_id: string;
  organization_name: string;
  feed_id: string;
  feed_name: string;
  feed_pref_id: number;
  feed_license_id: string;
  file_url: string;
  file_to_date: string;
}

/** 国交省GTFSデータリポジトリの全フィード一覧(有効期限内の最新版) */
export async function listFeeds(): Promise<GtfsFeedInfo[]> {
  const res = await fetch(FILES_API);
  if (!res.ok) throw new Error(`gtfs-data.jp files API failed: ${res.status}`);
  const json = (await res.json()) as { body?: GtfsFeedInfo[] } | GtfsFeedInfo[];
  const body = Array.isArray(json) ? json : (json.body ?? []);
  // 同一org+feedで複数期間が返るため、file_to_dateが最も新しい版を採用する
  const seen = new Map<string, GtfsFeedInfo>();
  for (const f of body) {
    const key = `${f.organization_id}/${f.feed_id}`;
    const cur = seen.get(key);
    if (!cur || (f.file_to_date ?? "") > (cur.file_to_date ?? "")) seen.set(key, f);
  }
  return [...seen.values()];
}

/** フィードzipをDL・必要ファイルのみ展開し、展開先を返す。失敗時はnull */
export async function fetchFeed(feed: GtfsFeedInfo): Promise<string | null> {
  const key = `${feed.organization_id}_${feed.feed_id}`;
  const zipPath = path.join(GTFS_DIR, `${key}.zip`);
  const extractDir = path.join(GTFS_DIR, key);
  mkdirSync(GTFS_DIR, { recursive: true });

  try {
    if (!existsSync(zipPath)) {
      const res = await fetch(feed.file_url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
      const tmpPath = `${zipPath}.tmp`;
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tmpPath));
      renameSync(tmpPath, zipPath);
    }
    if (!existsSync(extractDir)) {
      // 中断で不完全な展開が「展開済み」扱いにならないよう一時ディレクトリ経由
      const tmpDir = `${extractDir}.tmp`;
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true });
      // 描画に必要なファイルだけ展開(stop_times等の巨大ファイルは触らない)
      // ファイルが存在しないと unzip が非0終了するため個別に許容する
      for (const name of ["stops.txt", "routes.txt", "trips.txt", "shapes.txt", "stop_times.txt"]) {
        try {
          execFileSync("unzip", ["-o", "-q", "-j", zipPath, name, `*/${name}`, "-d", tmpDir], { stdio: "ignore" });
        } catch {
          /* 任意ファイル: 無ければスキップ */
        }
      }
      if (!existsSync(path.join(tmpDir, "stops.txt"))) throw new Error("stops.txt missing");
      renameSync(tmpDir, extractDir);
    }
    if (!existsSync(path.join(extractDir, "stops.txt"))) throw new Error("stops.txt missing");
    // 過去バージョンの展開ディレクトリに stop_times.txt が無い場合は追加展開する
    if (!existsSync(path.join(extractDir, "stop_times.txt"))) {
      try {
        execFileSync("unzip", ["-o", "-q", "-j", zipPath, "stop_times.txt", "*/stop_times.txt", "-d", extractDir], {
          stdio: "ignore",
        });
      } catch {
        /* stop_times.txt が無いフィードは時刻表なしとして扱う */
      }
    }
    return extractDir;
  } catch (e) {
    console.warn(`[gtfs-jp] skip ${key}: ${(e as Error).message}`);
    rmSync(`${zipPath}.tmp`, { force: true });
    rmSync(`${extractDir}.tmp`, { recursive: true, force: true });
    return null;
  }
}
