import type maplibregl from "maplibre-gl";
import type { LayerState } from "./layers/transit";

/** モード特化ビューの対象モード(URLハッシュ &mode= の値) */
export const FOCUS_MODES = ["rail", "bus", "ferry", "air", "ropeway"] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

export const FOCUS_LABELS: Record<FocusMode, string> = {
  rail: "鉄道",
  bus: "バス",
  ferry: "航路",
  air: "空路",
  ropeway: "索道",
};

/** 地物のmode(shinkansen/jr/tram等)をフォーカスモードへ丸める */
export function toFocusMode(featureMode: string | undefined): FocusMode | null {
  if (!featureMode) return null;
  if (["shinkansen", "jr", "rail", "tram", "monorail", "cable"].includes(featureMode)) return "rail";
  return (FOCUS_MODES as readonly string[]).includes(featureMode) ? (featureMode as FocusMode) : null;
}

/** フォーカス中に表示するレイヤー構成(駅・停留所は点レイヤーとして常に道連れ) */
export function focusLayerState(mode: FocusMode, stations: boolean): LayerState {
  return {
    rail: mode === "rail",
    stations: mode === "rail" && stations,
    bus: mode === "bus",
    ferry: mode === "ferry",
    air: mode === "air",
    ropeway: mode === "ropeway",
  };
}

/** モード切替時のカメラ演出。air/ferryは全国俯瞰、それ以外は現在地に寄る */
export function flyToFocus(map: maplibregl.Map, mode: FocusMode | null) {
  if (mode === "air") {
    map.flyTo({ center: [137.5, 36.5], zoom: 4.4, pitch: 45, bearing: 0, duration: 1600 });
  } else if (mode === "ferry") {
    map.flyTo({ center: [134.5, 34.0], zoom: 5.6, pitch: 35, bearing: 0, duration: 1600 });
  } else if (mode === "rail") {
    map.flyTo({ zoom: Math.max(map.getZoom(), 8.5), pitch: 58, duration: 1400 });
  } else if (mode === "bus") {
    map.flyTo({ zoom: Math.max(map.getZoom(), 10.5), pitch: 45, duration: 1400 });
  } else if (mode === "ropeway") {
    map.flyTo({ zoom: Math.max(map.getZoom(), 9), pitch: 68, duration: 1400 });
  }
  // 全体表示に戻るときはカメラを動かさない(ユーザーの現在地感を保つ)
}

/** location.hash の &mode= を読む(maplibre hash:"map" と共存) */
export function readModeFromHash(): FocusMode | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const m = params.get("mode");
  return m && (FOCUS_MODES as readonly string[]).includes(m) ? (m as FocusMode) : null;
}

/** &mode= を書き換える。map= 等の他パラメータは保持する */
export function writeModeToHash(mode: FocusMode | null) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (mode) params.set("mode", mode);
  else params.delete("mode");
  // URLSearchParams は "/" を %2F にするが maplibre は素の "/" を書く。見た目を保つため戻す
  const hash = params.toString().replace(/%2F/gi, "/");
  location.hash = hash;
}
