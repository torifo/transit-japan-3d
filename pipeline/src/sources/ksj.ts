import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** 国土数値情報のzipをダウンロード・展開し、展開先ディレクトリを返す(キャッシュ付き) */
export async function fetchKsj(id: string, url: string): Promise<string> {
  const rawDir = path.join(ROOT, "data/raw", id);
  const zipPath = path.join(rawDir, path.basename(url));
  const extractDir = path.join(rawDir, "extracted");
  mkdirSync(rawDir, { recursive: true });

  if (!existsSync(zipPath)) {
    console.log(`[ksj:${id}] downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`);
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(zipPath));
  } else {
    console.log(`[ksj:${id}] zip cached`);
  }

  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);
  }
  return extractDir;
}

export const KSJ_URLS = {
  n02Rail: "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip",
  n05RailTimeSeries: "https://nlftp.mlit.go.jp/ksj/gml/data/N05/N05-24/N05-24_GML.zip",
  n09FerryRoutes: "https://nlftp.mlit.go.jp/ksj/gml/data/N09/N09-12/N09-12_GML.zip",
  s10bAirFlow: "https://nlftp.mlit.go.jp/ksj/gml/data/S10b/S10b-14/S10b-14_GML.zip",
  c28Airports: "https://nlftp.mlit.go.jp/ksj/gml/data/C28/C28-21/C28-21_GML.zip",
} as const;
