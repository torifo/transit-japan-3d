/** GTFSの "HH:MM:SS"(HHは24超可) を深夜0時起点の秒へ。空・不正はnull */
export function gtfsTimeToSec(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
