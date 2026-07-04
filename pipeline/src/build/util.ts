import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT_DIR = path.join(ROOT, "web/public/data");

/** ディレクトリ以下からキーワードを含む拡張子一致ファイルを再帰検索 */
export function findFile(dir: string, keyword: string, ext: string): string {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
    );
  const hit = walk(dir).find((f) => f.includes(keyword) && f.endsWith(ext));
  if (!hit) throw new Error(`file not found: *${keyword}*${ext} in ${dir}`);
  return hit;
}

export function mapshaper(args: string[]) {
  execFileSync("npx", ["mapshaper", ...args], { stdio: "inherit", cwd: ROOT });
}
