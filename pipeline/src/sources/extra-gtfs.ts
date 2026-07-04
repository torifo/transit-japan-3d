import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "../build/csv";
import { ROOT } from "../build/util";

// gtfs-data.jp に無い事業者(例: ODPT京王バス=ちゅうバス含む)を手動配置で取り込む口。
// data/raw/extra-gtfs/*.zip を置くと bus.ts がフィードとして処理する。
// 取得手順・ライセンスは SETUP.md を参照。

const EXTRA_DIR = path.join(ROOT, "data/raw/extra-gtfs");

export interface ExtraFeed {
  /** 事業者名(agency.txt由来、無ければzipファイル名) */
  organizationName: string;
  dir: string;
}

/** 手動配置されたGTFS zipを展開し、フィード一覧として返す */
export function listExtraFeeds(): ExtraFeed[] {
  if (!existsSync(EXTRA_DIR)) return [];
  const feeds: ExtraFeed[] = [];
  for (const zip of readdirSync(EXTRA_DIR).filter((f) => f.endsWith(".zip"))) {
    const zipPath = path.join(EXTRA_DIR, zip);
    const extractDir = zipPath.replace(/\.zip$/, "");
    try {
      if (!existsSync(extractDir)) {
        // 中断で不完全な展開が「展開済み」扱いにならないよう一時ディレクトリ経由
        const tmpDir = `${extractDir}.tmp`;
        rmSync(tmpDir, { recursive: true, force: true });
        mkdirSync(tmpDir, { recursive: true });
        for (const name of ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "shapes.txt", "stop_times.txt"]) {
          try {
            execFileSync("unzip", ["-o", "-q", "-j", zipPath, name, `*/${name}`, "-d", tmpDir], { stdio: "ignore" });
          } catch {
            /* 任意ファイル: 無ければスキップ */
          }
        }
        if (!existsSync(path.join(tmpDir, "stops.txt"))) throw new Error("stops.txt missing");
        renameSync(tmpDir, extractDir);
      }
      const agencyPath = path.join(extractDir, "agency.txt");
      const agency = existsSync(agencyPath) ? parseCsv(readFileSync(agencyPath, "utf8")) : [];
      feeds.push({
        organizationName: agency[0]?.agency_name || path.basename(zip, ".zip"),
        dir: extractDir,
      });
    } catch (e) {
      console.warn(`[extra-gtfs] skip ${zip}: ${(e as Error).message}`);
      rmSync(`${extractDir}.tmp`, { recursive: true, force: true });
    }
  }
  return feeds;
}
