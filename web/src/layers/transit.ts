import { GeoJsonLayer, ArcLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Tooltip } from "../ui/panel";

// pipeline側 classifyRail() / 各build スクリプトの mode と対応
const MODE_COLORS: Record<string, [number, number, number, number]> = {
  shinkansen: [56, 211, 159, 230],
  jr: [91, 140, 255, 220],
  rail: [255, 171, 64, 200],
  tram: [255, 99, 132, 220],
  monorail: [186, 104, 200, 220],
  cable: [255, 235, 59, 230],
  bus: [255, 202, 40, 130],
  ferry: [77, 208, 225, 180],
  air: [240, 98, 146, 70],
  ropeway: [174, 213, 129, 230],
};

export type LayerState = {
  rail: boolean;
  stations: boolean;
  bus: boolean;
  ferry: boolean;
  air: boolean;
  /** 国際線アークの表示(既定オフ。データには常に含まれる) */
  intl: boolean;
  ropeway: boolean;
};

export interface TransitData {
  railSections: GeoJSON.FeatureCollection;
  railStations: GeoJSON.FeatureCollection;
  ferryRoutes: GeoJSON.FeatureCollection | null;
  airRoutes: GeoJSON.FeatureCollection | null;
  airports: GeoJSON.FeatureCollection | null;
  ropeways: GeoJSON.FeatureCollection | null;
  // バスは巨大なため初回トグルON時に遅延ロードする
  busRoutes: GeoJSON.FeatureCollection | null;
  busStops: GeoJSON.FeatureCollection | null;
  // 時代スライダー用(N05時系列)。初回操作時に遅延ロード
  historySections: GeoJSON.FeatureCollection | null;
  historyStations: GeoJSON.FeatureCollection | null;
}

/** 現在扱いにする年(スライダー最大値) */
export const CURRENT_YEAR = 2026;

let historyLoad: Promise<void> | null = null;

/** N05時系列データの遅延ロード(in-flight共有・部分失敗は再試行可) */
export function loadHistoryData(data: TransitData): Promise<void> {
  if (data.historySections && data.historyStations) return Promise.resolve();
  historyLoad ??= (async () => {
    const [historySections, historyStations] = await Promise.all([
      data.historySections ? Promise.resolve(data.historySections) : fetchOptional("/data/rail-history-sections.geojson"),
      data.historyStations ? Promise.resolve(data.historyStations) : fetchOptional("/data/rail-history-stations.geojson"),
    ]);
    data.historySections = historySections;
    data.historyStations = historyStations;
    historyLoad = null;
  })();
  return historyLoad;
}

// era変更以外の再描画でdeck.glが再計算しないよう、フィルタ結果をeraでメモ化
const eraCache = new Map<GeoJSON.FeatureCollection, { era: number; result: GeoJSON.FeatureCollection }>();

/** 指定年に存在していた区間・駅のみ残す */
export function filterByEra(fc: GeoJSON.FeatureCollection, era: number): GeoJSON.FeatureCollection {
  const cached = eraCache.get(fc);
  if (cached && cached.era === era) return cached.result;
  const result: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: fc.features.filter((f) => {
      const p = f.properties as { from?: number | null; to?: number | null };
      return (p.from == null || p.from <= era) && (p.to == null || p.to >= era);
    }),
  };
  eraCache.set(fc, { era, result });
  return result;
}

// 連打による重複fetchを防ぐin-flight共有。失敗分(null)は次回呼び出しで再試行される
let busLoad: Promise<void> | null = null;

/** バスデータ(重量級)の遅延ロード。取得失敗時はnullのまま(再試行可) */
export function loadBusData(data: TransitData): Promise<void> {
  if (data.busRoutes && data.busStops) return Promise.resolve();
  busLoad ??= (async () => {
    const [busRoutes, busStops] = await Promise.all([
      data.busRoutes ? Promise.resolve(data.busRoutes) : fetchOptional("/data/bus-routes.geojson"),
      data.busStops ? Promise.resolve(data.busStops) : fetchOptional("/data/bus-stops.geojson"),
    ]);
    data.busRoutes = busRoutes;
    data.busStops = busStops;
    busLoad = null;
  })();
  return busLoad;
}

async function fetchOptional(url: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** 一部データの取得失敗では全体を止めず、取れたレイヤーだけ返す */
export async function loadTransitData(): Promise<{ data: TransitData; missing: string[] }> {
  const names = ["rail-sections", "rail-stations", "ferry-routes", "air-routes", "airports", "ropeways"];
  const results = await Promise.all(names.map((n) => fetchOptional(`/data/${n}.geojson`)));
  const missing = names.filter((_, i) => results[i] === null);
  const [railSections, railStations, ferryRoutes, airRoutes, airports, ropeways] = results;
  return {
    data: {
      railSections: railSections ?? EMPTY,
      railStations: railStations ?? EMPTY,
      ferryRoutes,
      airRoutes,
      airports,
      ropeways,
      busRoutes: null,
      busStops: null,
      historySections: null,
      historyStations: null,
    },
    missing,
  };
}

function showTooltip(info: PickingInfo, tooltip: Tooltip) {
  // GeoJSON featureは.properties、ArcLayerのAirArcはプレーンオブジェクト
  const p = info.object?.properties ?? (info.object as { n?: string; op?: string } | undefined);
  if (!p) {
    tooltip.hide();
    return;
  }
  const RAIL_MODES = ["shinkansen", "jr", "rail", "tram", "monorail", "cable"];
  const name = p.stn ? `${p.stn}${RAIL_MODES.includes(p.mode as string) ? "駅" : ""}` : (p.n ?? "(不明)");
  const period =
    p.from != null || p.to != null ? ` [${p.from ?? "?"}〜${p.to ?? "現役"}]` : "";
  const subtitle = `${p.n && p.stn ? p.n + " / " : ""}${p.op ?? ""}${period}`;
  tooltip.show(name, subtitle, info.x, info.y);
}

interface AirArc {
  from: [number, number];
  to: [number, number];
  n: string;
  pax: number;
  intl: boolean;
}

function toArcs(fc: GeoJSON.FeatureCollection, includeIntl: boolean): AirArc[] {
  return fc.features
    .filter((f) => f.geometry?.type === "LineString" && (f.geometry as GeoJSON.LineString).coordinates.length >= 2)
    .map((f) => {
      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      const p = f.properties as { n?: string; pax?: number; intl?: boolean };
      return {
        from: coords[0] as [number, number],
        to: coords[coords.length - 1] as [number, number],
        n: p?.n ?? "",
        pax: p?.pax ?? 0,
        intl: p?.intl ?? false,
      };
    })
    .filter((a) => includeIntl || !a.intl);
}

/** フォーカスモード時の強調係数。overview(null)では全て1 */
export interface FocusStyle {
  lineWidth: number;
  pointRadius: number;
  alphaBoost: number;
}

const NO_FOCUS: FocusStyle = { lineWidth: 1, pointRadius: 1, alphaBoost: 1 };

function boostAlpha(color: [number, number, number, number], f: number): [number, number, number, number] {
  return [color[0], color[1], color[2], Math.min(255, Math.round(color[3] * f))];
}

export function buildTransitLayers(
  data: TransitData,
  state: LayerState,
  tooltip: Tooltip,
  era: number = CURRENT_YEAR,
  focus: FocusStyle = NO_FOCUS,
): Layer[] {
  const layers: Layer[] = [];
  const hover = (info: PickingInfo) => showTooltip(info, tooltip);
  // 過去年ではN02現況の代わりにN05時系列(当時の路線網)を描画する。
  // 履歴データ未取得のまま現況へフォールバックすると「過去なのに現在の網」に見えるため、
  // 過去年では履歴データが揃うまで鉄道レイヤーを出さない
  const historic = era < CURRENT_YEAR;

  if (state.ferry && data.ferryRoutes) {
    layers.push(
      new GeoJsonLayer({
        id: "ferry-routes",
        data: data.ferryRoutes,
        lineWidthUnits: "pixels",
        getLineWidth: 1.2 * focus.lineWidth,
        getLineColor: boostAlpha(MODE_COLORS.ferry, focus.alphaBoost),
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.rail && historic && data.historySections) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-history-sections",
        data: filterByEra(data.historySections, era),
        lineWidthUnits: "pixels",
        getLineWidth: 1.8 * focus.lineWidth,
        getLineColor: boostAlpha(MODE_COLORS.jr, focus.alphaBoost),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
        onHover: hover,
      }),
    );
  }
  if (state.stations && historic && data.historyStations) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-history-stations",
        data: filterByEra(data.historyStations, era),
        pointType: "circle",
        getPointRadius: 40 * focus.pointRadius,
        pointRadiusMinPixels: 1.2 * focus.pointRadius,
        pointRadiusMaxPixels: 6 * focus.pointRadius,
        getFillColor: [232, 237, 247, 235],
        getLineColor: [11, 16, 32, 255],
        lineWidthMinPixels: 0.5,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.rail && !historic) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-sections",
        data: data.railSections,
        lineWidthUnits: "pixels",
        getLineWidth: (f) => (f.properties?.mode === "shinkansen" ? 2.5 : 1.5) * focus.lineWidth,
        getLineColor: (f) =>
          boostAlpha(MODE_COLORS[f.properties?.mode as string] ?? MODE_COLORS.rail, focus.alphaBoost),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
        onHover: hover,
      }),
    );
  }

  if (state.bus && data.busRoutes) {
    layers.push(
      new GeoJsonLayer({
        id: "bus-routes",
        data: data.busRoutes,
        lineWidthUnits: "pixels",
        getLineWidth: 1 * focus.lineWidth,
        getLineColor: boostAlpha(MODE_COLORS.bus, focus.alphaBoost),
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }
  if (state.bus && data.busStops) {
    layers.push(
      new GeoJsonLayer({
        id: "bus-stops",
        data: data.busStops,
        pointType: "circle",
        getPointRadius: 15 * focus.pointRadius,
        pointRadiusMinPixels: 0.5,
        pointRadiusMaxPixels: 4 * focus.pointRadius,
        getFillColor: [255, 202, 40, 200],
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.ropeway && data.ropeways) {
    layers.push(
      new GeoJsonLayer({
        id: "ropeways",
        data: data.ropeways,
        lineWidthUnits: "pixels",
        getLineWidth: 2 * focus.lineWidth,
        getLineColor: MODE_COLORS.ropeway,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.air && data.airRoutes) {
    layers.push(
      new ArcLayer<AirArc>({
        id: "air-routes",
        data: toArcs(data.airRoutes, state.intl),
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getHeight: 0.35,
        getWidth: (d) => Math.max(0.4, Math.min(2.5, Math.sqrt(d.pax) / 1000)) * focus.lineWidth,
        getSourceColor: boostAlpha(MODE_COLORS.air, focus.alphaBoost),
        getTargetColor: boostAlpha([186, 104, 200, 50], focus.alphaBoost),
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.air && data.airports) {
    layers.push(
      new GeoJsonLayer({
        id: "airports",
        data: data.airports,
        pointType: "circle",
        getPointRadius: 400 * focus.pointRadius,
        pointRadiusMinPixels: 2.5,
        pointRadiusMaxPixels: 8 * focus.pointRadius,
        getFillColor: [240, 98, 146, 235],
        getLineColor: [11, 16, 32, 255],
        lineWidthMinPixels: 0.5,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.stations && !historic) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-stations",
        data: data.railStations,
        pointType: "circle",
        getPointRadius: 40 * focus.pointRadius,
        pointRadiusMinPixels: 1.2 * focus.pointRadius,
        pointRadiusMaxPixels: 6 * focus.pointRadius,
        getFillColor: [232, 237, 247, 235],
        getLineColor: [11, 16, 32, 255],
        lineWidthMinPixels: 0.5,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  return layers;
}
