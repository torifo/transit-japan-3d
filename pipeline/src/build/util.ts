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
  // KSJのzipはUTF-8/Shift-JISの同名ファイルを含むことがあるためUTF-8側を優先する
  const hits = walk(dir)
    .filter((f) => f.includes(keyword) && f.endsWith(ext))
    .sort((a, b) => Number(b.includes("UTF-8")) - Number(a.includes("UTF-8")));
  if (hits.length === 0) throw new Error(`file not found: *${keyword}*${ext} in ${dir}`);
  return hits[0];
}

export function mapshaper(args: string[]) {
  execFileSync("npx", ["mapshaper", ...args], { stdio: "inherit", cwd: ROOT });
}
