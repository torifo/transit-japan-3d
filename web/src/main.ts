import { createMap } from "./map";
import {
  buildTransitLayers,
  filterRoute,
  loadTransitData,
  loadBusData,
  loadHistoryData,
  CURRENT_YEAR,
  type LayerState,
  type FocusStyle,
} from "./layers/transit";
import {
  FOCUS_LABELS,
  flyToFocus,
  focusLayerState,
  readFocusFromHash,
  writeFocusToHash,
  type FocusMode,
  type RouteRef,
} from "./modes";
import { VehicleAnimator } from "./anim/vehicles";
import { ApproxRail } from "./anim/approx-rail";
import { setupTooltip, showError } from "./ui/panel";
import { setupSearch } from "./ui/search";
import { StationPanel } from "./ui/station-panel";
import type { Layer } from "@deck.gl/core";

// deck.glレイヤーid → フォーカスモード(クリックピン留めの遷移先判定)
const LAYER_FOCUS: Record<string, FocusMode> = {
  "rail-sections": "rail",
  "rail-history-sections": "rail",
  "rail-stations": "rail",
  "rail-history-stations": "rail",
  "bus-routes": "bus",
  "bus-stops": "bus",
  "ferry-routes": "ferry",
  "air-routes": "air",
  airports: "air",
  ropeways: "ropeway",
};

const FOCUS_STYLE: FocusStyle = { lineWidth: 2, pointRadius: 1.5, alphaBoost: 1.35 };

async function init() {
  const shell = await createMap(document.getElementById("map")!);
  const tooltip = setupTooltip(
    (mode) => {
      tooltip.unpin();
      writeFocusToHash(mode);
    },
    (mode, route) => {
      tooltip.unpin();
      writeFocusToHash(mode, route);
    },
  );

  const { data, missing } = await loadTransitData();
  if (missing.length > 0) {
    showError(`一部データを取得できませんでした: ${missing.join(", ")}(パイプライン未実行の可能性)`);
  }

  const state: LayerState = { rail: true, stations: true, bus: false, ferry: true, air: true, intl: false, ropeway: true };
  const initial = readFocusFromHash();
  let focusMode: FocusMode | null = initial.mode;
  let focusRoute: RouteRef | null = initial.route;
  let era = CURRENT_YEAR;
  let vehiclesOn = false;
  let staticLayers: Layer[] = [];
  let vehicleLayer: Layer | null = null;

  const apply = () => {
    shell.overlay.setProps({ layers: vehicleLayer ? [...staticLayers, vehicleLayer] : staticLayers });
  };
  const render = () => {
    const s = focusMode ? focusLayerState(focusMode, state) : state;
    staticLayers = buildTransitLayers(data, s, tooltip, era, focusMode ? FOCUS_STYLE : undefined, focusRoute);
    apply();
  };

  // 車両アニメーション(時刻表補間)。過去年表示中は現代の車両を出さない
  // GTFS未提供の鉄道はN02形状からの近似運行(approx-rail)で補完する
  const animator = new VehicleAnimator();
  const approxRail = new ApproxRail();
  const clockEl = document.getElementById("clock")!;
  const vehCountEl = document.getElementById("veh-count")!;
  const vehicleCtl = document.getElementById("vehicle-ctl") as HTMLElement;
  const vehicleToggle = document.getElementById("toggle-vehicles") as HTMLInputElement;
  animator.speed = 60;
  const fmtClock = (sec: number) => {
    const h = Math.floor(sec / 3600) % 24;
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  let rafId = 0;
  const loop = () => {
    if (!vehiclesOn) return;
    if (era >= CURRENT_YEAR) {
      const railRoute = focusMode === "rail" ? focusRoute : null;
      let vehicles = [...animator.tick(), ...approxRail.tick(animator.clockSec, shell.map, railRoute)];
      // 路線フォーカス中は同一路線・同一事業者の車両のみ表示(周辺バス等のノイズを消す)
      if (railRoute) vehicles = vehicles.filter((v) => v.name === railRoute.n || v.op.startsWith(railRoute.op));
      vehicleLayer = animator.buildLayer(vehicles, (info) => {
        const v = info.object as { name?: string; op?: string } | undefined;
        if (v) tooltip.show(v.name || "(路線名なし)", v.op ?? "", info.x, info.y);
        else tooltip.hide();
      });
      clockEl.textContent = fmtClock(animator.clockSec);
      vehCountEl.textContent = `${vehicles.length}台`;
      apply();
    }
    rafId = requestAnimationFrame(loop);
  };

  const stopVehicles = () => {
    vehiclesOn = false;
    vehicleToggle.checked = false;
    vehicleCtl.style.display = "none";
    cancelAnimationFrame(rafId);
    vehicleLayer = null;
    apply();
  };

  vehicleToggle.addEventListener("change", async () => {
    vehiclesOn = vehicleToggle.checked;
    vehicleCtl.style.display = vehiclesOn ? "flex" : "none";
    if (vehiclesOn) {
      const ok = await animator.init();
      if (!ok) {
        showError("時刻表データがありません(pipeline/build/timetable.ts を実行)");
        return;
      }
      approxRail.build(data.railSections);
      animator.syncViewport(shell.map);
      loop();
    } else {
      cancelAnimationFrame(rafId);
      vehicleLayer = null;
      apply();
    }
  });
  document.getElementById("speed")!.addEventListener("change", (e) => {
    animator.speed = Number((e.target as HTMLSelectElement).value);
  });
  shell.map.on("moveend", () => {
    if (vehiclesOn) animator.syncViewport(shell.map);
  });

  // モード/路線フォーカス: &mode= &route= ハッシュに追従してパネル・レイヤー・カメラを切替
  const focusTitle = document.getElementById("focus-title")!;
  const backLink = document.getElementById("back-overview")!;

  // 路線フォーカス時: 対象路線の全地物が収まるようにカメラをフィット
  const flyToRoute = (mode: FocusMode, route: RouteRef): boolean => {
    const src = {
      rail: data.railSections,
      bus: data.busRoutes,
      ferry: data.ferryRoutes,
      air: data.airRoutes,
      ropeway: data.ropeways,
    }[mode];
    if (!src) return false;
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
    for (const f of filterRoute(src, route).features) {
      if (f.geometry?.type !== "LineString") continue;
      for (const [lon, lat] of (f.geometry as GeoJSON.LineString).coordinates as [number, number][]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (minLon > maxLon) return false;
    shell.map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 90, duration: 1600, maxZoom: 13 },
    );
    return true;
  };

  const applyMode = async (mode: FocusMode | null, route: RouteRef | null, fly: boolean) => {
    focusMode = mode;
    focusRoute = mode ? route : null;
    tooltip.unpin();
    if (mode) {
      document.body.dataset.focus = mode;
      if (focusRoute) document.body.dataset.focusRoute = "1";
      else delete document.body.dataset.focusRoute;
      focusTitle.textContent = focusRoute ? `ROUTE: ${focusRoute.n}` : `MODE: ${FOCUS_LABELS[mode]}特化`;
      backLink.textContent = focusRoute ? `← ${FOCUS_LABELS[mode]}モード全体へ` : "← 全体表示に戻る";
      // 車両アニメは鉄道向けのため、他モードでは停止する
      if (mode !== "rail" && vehiclesOn) stopVehicles();
      if (mode === "bus") {
        await loadBusData(data);
        if (!data.busRoutes && !data.busStops) showError("バスデータを取得できませんでした");
      }
    } else {
      delete document.body.dataset.focus;
      delete document.body.dataset.focusRoute;
    }
    render();
    if (fly) {
      if (!(mode && focusRoute && flyToRoute(mode, focusRoute))) flyToFocus(shell.map, mode);
    }
  };

  window.addEventListener("hashchange", () => {
    const f = readFocusFromHash();
    const changed =
      f.mode !== focusMode || (f.route?.n ?? null) !== (focusRoute?.n ?? null) || (f.route?.op ?? null) !== (focusRoute?.op ?? null);
    if (changed) void applyMode(f.mode, f.route, true);
  });
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    // 路線フォーカス中はまずモード全体へ、モードからは全体表示へ戻る
    writeFocusToHash(focusRoute ? focusMode : null);
  });
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".mode-link")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      writeFocusToHash(link.dataset.mode as FocusMode);
    });
  }

  // 初回: URLに &mode= があればその特化表示で開始(カメラは #map= があれば共有値を尊重)
  if (focusMode) {
    await applyMode(focusMode, focusRoute, !location.hash.includes("map="));
  } else {
    render();
  }

  // API連携: 場所検索と駅タップ→発車標(API不達時は静かに無効)
  setupSearch(shell.map);
  const stationPanel = new StationPanel();
  shell.map.on("click", (e) => {
    tooltip.unpin();
    const picked = shell.overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 10 });
    const props = picked?.object?.properties as { stn?: string; n?: string; op?: string } | undefined;
    const stn = props?.stn;
    if (stn) {
      // 駅・停留所は発車標を優先(俯瞰中の誤タップを避ける)
      if (shell.map.getZoom() >= 10) void stationPanel.showAt(e.lngLat.lat, e.lngLat.lng, stn);
      return;
    }
    // 路線系の地物はツールチップをピン留めし、路線フォーカス/モード全体へのリンクを出す
    const layerId = picked?.layer?.id;
    const obj = picked?.object as { n?: string; op?: string } | undefined;
    if (!layerId) return;
    const target = LAYER_FOCUS[layerId] ?? null;
    const name = props?.n ?? obj?.n ?? null;
    const op = props?.op ?? obj?.op ?? "";
    const route = target && name ? { n: name, op } : null;
    const sameRoute = route && focusRoute && route.n === focusRoute.n && route.op === focusRoute.op;
    tooltip.pin(name ?? "(名称なし)", op, {
      mode: target === focusMode && !focusRoute ? null : target,
      route: sameRoute ? null : route,
      routeMode: target,
    }, e.point.x, e.point.y);
  });

  const eraSlider = document.getElementById("era-slider") as HTMLInputElement;
  const eraLabel = document.getElementById("era-label")!;
  eraSlider.addEventListener("input", async () => {
    era = Number(eraSlider.value);
    eraLabel.textContent = era >= CURRENT_YEAR ? "現在" : `${era}年`;
    await loadHistoryData(data);
    render();
  });

  for (const key of Object.keys(state) as (keyof LayerState)[]) {
    const el = document.getElementById(`toggle-${key}`) as HTMLInputElement | null;
    el?.addEventListener("change", async () => {
      state[key] = el.checked;
      if (key === "bus" && el.checked) await loadBusData(data);
      render();
    });
  }
}

init();
