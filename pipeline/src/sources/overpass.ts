import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Overpass QLを実行しJSONを返す(クエリハッシュでキャッシュ) */
export async function overpass(query: string): Promise<OverpassResponse> {
  const hash = createHash("sha256").update(query).digest("hex").slice(0, 16);
  const cacheDir = path.join(ROOT, "data/raw/overpass");
  const cachePath = path.join(cacheDir, `${hash}.json`);
  mkdirSync(cacheDir, { recursive: true });

  if (existsSync(cachePath)) {
    console.log(`[overpass] cached ${hash}`);
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  console.log(`[overpass] querying (${hash})`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // overpass-api.de はUA無しのリクエストを406で拒否する
      "User-Agent": "transit-japan-3d/0.1 (personal research)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`overpass failed: ${res.status}`);
  const json = await res.json();
  writeFileSync(cachePath, JSON.stringify(json));
  return json;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
