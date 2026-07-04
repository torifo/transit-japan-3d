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
  ferry: [77, 208, 225, 180],
  air: [240, 98, 146, 70],
  ropeway: [174, 213, 129, 230],
};

export type LayerState = {
  rail: boolean;
  stations: boolean;
  ferry: boolean;
  air: boolean;
  ropeway: boolean;
};

export interface TransitData {
  railSections: GeoJSON.FeatureCollection;
  railStations: GeoJSON.FeatureCollection;
  ferryRoutes: GeoJSON.FeatureCollection | null;
  airRoutes: GeoJSON.FeatureCollection | null;
  airports: GeoJSON.FeatureCollection | null;
  ropeways: GeoJSON.FeatureCollection | null;
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
  const name = p.stn ? `${p.stn}${p.mode === "air" ? "" : "駅"}` : (p.n ?? "(不明)");
  const subtitle = `${p.n && p.stn ? p.n + " / " : ""}${p.op ?? ""}`;
  tooltip.show(name, subtitle, info.x, info.y);
}

interface AirArc {
  from: [number, number];
  to: [number, number];
  n: string;
  pax: number;
}

function toArcs(fc: GeoJSON.FeatureCollection): AirArc[] {
  return fc.features
    .filter((f) => f.geometry?.type === "LineString" && (f.geometry as GeoJSON.LineString).coordinates.length >= 2)
    .map((f) => {
      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      const p = f.properties as { n?: string; pax?: number };
      return {
        from: coords[0] as [number, number],
        to: coords[coords.length - 1] as [number, number],
        n: p?.n ?? "",
        pax: p?.pax ?? 0,
      };
    });
}

export function buildTransitLayers(data: TransitData, state: LayerState, tooltip: Tooltip): Layer[] {
  const layers: Layer[] = [];
  const hover = (info: PickingInfo) => showTooltip(info, tooltip);

  if (state.ferry && data.ferryRoutes) {
    layers.push(
      new GeoJsonLayer({
        id: "ferry-routes",
        data: data.ferryRoutes,
        lineWidthUnits: "pixels",
        getLineWidth: 1.2,
        getLineColor: MODE_COLORS.ferry,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.rail) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-sections",
        data: data.railSections,
        lineWidthUnits: "pixels",
        getLineWidth: (f) => (f.properties?.mode === "shinkansen" ? 2.5 : 1.5),
        getLineColor: (f) => MODE_COLORS[f.properties?.mode as string] ?? MODE_COLORS.rail,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
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
        getLineWidth: 2,
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
        data: toArcs(data.airRoutes),
        getSourcePosition: (d) => d.from,
        getTargetPosition: (d) => d.to,
        getHeight: 0.35,
        getWidth: (d) => Math.max(0.4, Math.min(2.5, Math.sqrt(d.pax) / 1000)),
        getSourceColor: MODE_COLORS.air,
        getTargetColor: [186, 104, 200, 50],
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
        getPointRadius: 400,
        pointRadiusMinPixels: 2.5,
        pointRadiusMaxPixels: 8,
        getFillColor: [240, 98, 146, 235],
        getLineColor: [11, 16, 32, 255],
        lineWidthMinPixels: 0.5,
        pickable: true,
        autoHighlight: true,
        onHover: hover,
      }),
    );
  }

  if (state.stations) {
    layers.push(
      new GeoJsonLayer({
        id: "rail-stations",
        data: data.railStations,
        pointType: "circle",
        getPointRadius: 40,
        pointRadiusMinPixels: 1.2,
        pointRadiusMaxPixels: 6,
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
