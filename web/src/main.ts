import { createMap } from "./map";
import {
  buildTransitLayers,
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
  readModeFromHash,
  writeModeToHash,
  type FocusMode,
} from "./modes";
import { VehicleAnimator } from "./anim/vehicles";
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
  const tooltip = setupTooltip((mode) => {
    tooltip.unpin();
    writeModeToHash(mode);
  });

  const { data, missing } = await loadTransitData();
  if (missing.length > 0) {
    showError(`一部データを取得できませんでした: ${missing.join(", ")}(パイプライン未実行の可能性)`);
  }

  const state: LayerState = { rail: true, stations: true, bus: false, ferry: true, air: true, intl: false, ropeway: true };
  let focusMode: FocusMode | null = readModeFromHash();
  let era = CURRENT_YEAR;
  let vehiclesOn = false;
  let staticLayers: Layer[] = [];
  let vehicleLayer: Layer | null = null;

  const apply = () => {
    shell.overlay.setProps({ layers: vehicleLayer ? [...staticLayers, vehicleLayer] : staticLayers });
  };
  const render = () => {
    const s = focusMode ? focusLayerState(focusMode, state) : state;
    staticLayers = buildTransitLayers(data, s, tooltip, era, focusMode ? FOCUS_STYLE : undefined);
    apply();
  };

  // 車両アニメーション(時刻表補間)。過去年表示中は現代の車両を出さない
  const animator = new VehicleAnimator();
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
      const vehicles = animator.tick();
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

  // モード特化ビュー: &mode= ハッシュに追従してパネル・レイヤー・カメラを切替
  const focusTitle = document.getElementById("focus-title")!;
  const applyMode = async (mode: FocusMode | null, fly: boolean) => {
    focusMode = mode;
    tooltip.unpin();
    if (mode) {
      document.body.dataset.focus = mode;
      focusTitle.textContent = `MODE: ${FOCUS_LABELS[mode]}特化`;
      // 車両アニメは鉄道向けのため、他モードでは停止する
      if (mode !== "rail" && vehiclesOn) stopVehicles();
      if (mode === "bus") {
        await loadBusData(data);
        if (!data.busRoutes && !data.busStops) showError("バスデータを取得できませんでした");
      }
    } else {
      delete document.body.dataset.focus;
    }
    render();
    if (fly) flyToFocus(shell.map, mode);
  };

  window.addEventListener("hashchange", () => {
    const m = readModeFromHash();
    if (m !== focusMode) void applyMode(m, true);
  });
  document.getElementById("back-overview")!.addEventListener("click", (e) => {
    e.preventDefault();
    writeModeToHash(null);
  });
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".mode-link")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      writeModeToHash(link.dataset.mode as FocusMode);
    });
  }

  // 初回: URLに &mode= があればその特化表示で開始(カメラは #map= があれば共有値を尊重)
  if (focusMode) {
    await applyMode(focusMode, !location.hash.includes("map="));
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
    // 路線系の地物はツールチップをピン留めし、モード特化ビューへのリンクを出す
    const layerId = picked?.layer?.id;
    const obj = picked?.object as { n?: string; op?: string } | undefined;
    if (!layerId) return;
    const target = LAYER_FOCUS[layerId] ?? null;
    const name = props?.n ?? obj?.n ?? "(名称なし)";
    const op = props?.op ?? obj?.op ?? "";
    tooltip.pin(name, op, target === focusMode ? null : target, e.point.x, e.point.y);
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
