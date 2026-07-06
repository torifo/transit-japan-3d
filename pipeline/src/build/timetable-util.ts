/** GTFSの "HH:MM:SS"(HHは24超可) を深夜0時起点の秒へ。空・不正はnull */
export function gtfsTimeToSec(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** [sec, lon, lat] */
export type SeqPoint = [number, number, number];

/** 経度差の縮み(cos緯度)を考慮した近似距離(km)。日本域の補間用途には十分 */
function distKm(lon0: number, lat0: number, lon1: number, lat1: number): number {
  const ky = 111.32;
  const kx = ky * Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180));
  return Math.hypot((lon1 - lon0) * kx, (lat1 - lat0) * ky);
}

const MAX_SNAP_KM = 0.5; // 停留所がshapeからこれ以上離れていたら形状不一致とみなす
const MIN_GAP_KM = 0.15; // 出力する中間点の最小間隔(ファイル肥大防止)

/**
 * 停留所間の直線移動をshape(路線形状)沿いの中間点で埋める。
 * 各停留所を形状上の最近傍頂点へ前方走査で対応付け、区間内の頂点に
 * 距離按分した時刻を与える。形状と合わない場合は元の列をそのまま返す。
 */
export function densifyAlongShape(stopSeq: SeqPoint[], shape: [number, number][]): SeqPoint[] {
  if (stopSeq.length < 2 || shape.length < 2) return stopSeq;

  // 停留所→shape頂点の対応(前方走査で単調に)
  const idx: number[] = [];
  let cursor = 0;
  for (const [, lon, lat] of stopSeq) {
    let best = cursor;
    let bestD = Infinity;
    for (let j = cursor; j < shape.length; j++) {
      const d = distKm(lon, lat, shape[j][0], shape[j][1]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (bestD > MAX_SNAP_KM) return stopSeq;
    idx.push(best);
    cursor = best;
  }

  const out: SeqPoint[] = [stopSeq[0]];
  for (let i = 0; i < stopSeq.length - 1; i++) {
    const [t0] = stopSeq[i];
    const [t1, lon1, lat1] = stopSeq[i + 1];
    const a = idx[i];
    const b = idx[i + 1];
    if (b > a && t1 > t0) {
      // 区間の形状沿い累積距離
      const cum: number[] = [0];
      for (let j = a + 1; j <= b; j++) {
        cum.push(cum[cum.length - 1] + distKm(shape[j - 1][0], shape[j - 1][1], shape[j][0], shape[j][1]));
      }
      const total = cum[cum.length - 1];
      if (total > 0) {
        let lastKept = 0;
        for (let j = a + 1; j < b; j++) {
          const c = cum[j - a];
          if (c - lastKept < MIN_GAP_KM) continue;
          lastKept = c;
          const t = Math.round(t0 + (c / total) * (t1 - t0));
          out.push([t, shape[j][0], shape[j][1]]);
        }
      }
    }
    out.push([t1, lon1, lat1]);
  }
  return out;
}
