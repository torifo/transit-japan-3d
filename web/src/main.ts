import { createMap } from "./map";
import {
  buildTransitLayers,
  loadTransitData,
  loadBusData,
  loadHistoryData,
  CURRENT_YEAR,
  type LayerState,
} from "./layers/transit";
import { VehicleAnimator } from "./anim/vehicles";
import { setupTooltip, showError } from "./ui/panel";
import { setupSearch } from "./ui/search";
import { StationPanel } from "./ui/station-panel";
import type { Layer } from "@deck.gl/core";

async function init() {
  const shell = await createMap(document.getElementById("map")!);
  const tooltip = setupTooltip();

  const { data, missing } = await loadTransitData();
  if (missing.length > 0) {
    showError(`一部データを取得できませんでした: ${missing.join(", ")}(パイプライン未実行の可能性)`);
  }

  const state: LayerState = { rail: true, stations: true, bus: false, ferry: true, air: true, ropeway: true };
  let era = CURRENT_YEAR;
  let vehiclesOn = false;
  let staticLayers: Layer[] = [];
  let vehicleLayer: Layer | null = null;

  const apply = () => {
    shell.overlay.setProps({ layers: vehicleLayer ? [...staticLayers, vehicleLayer] : staticLayers });
  };
  const render = () => {
    staticLayers = buildTransitLayers(data, state, tooltip, era);
    apply();
  };
  render();

  // 車両アニメーション(時刻表補間)。過去年表示中は現代の車両を出さない
  const animator = new VehicleAnimator();
  const clockEl = document.getElementById("clock")!;
  const vehCountEl = document.getElementById("veh-count")!;
  const vehicleCtl = document.getElementById("vehicle-ctl") as HTMLElement;
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

  document.getElementById("toggle-vehicles")!.addEventListener("change", async (e) => {
    vehiclesOn = (e.target as HTMLInputElement).checked;
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

  // API連携: 場所検索と駅タップ→発車標(API不達時は静かに無効)
  setupSearch(shell.map);
  const stationPanel = new StationPanel();
  shell.map.on("click", (e) => {
    if (shell.map.getZoom() < 10) return; // 俯瞰中の誤タップを避ける
    // 駅ポイントをピックできれば駅名で正確にID解決、できなければ座標フォールバック
    const picked = shell.overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 10 });
    const stn = (picked?.object?.properties as { stn?: string } | undefined)?.stn;
    void stationPanel.showAt(e.lngLat.lat, e.lngLat.lng, stn ?? null);
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
