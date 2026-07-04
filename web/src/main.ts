import { createMap } from "./map";
import {
  buildTransitLayers,
  loadTransitData,
  loadBusData,
  loadHistoryData,
  CURRENT_YEAR,
  type LayerState,
} from "./layers/transit";
import { setupTooltip, showError } from "./ui/panel";

async function init() {
  const shell = await createMap(document.getElementById("map")!);
  const tooltip = setupTooltip();

  const { data, missing } = await loadTransitData();
  if (missing.length > 0) {
    showError(`一部データを取得できませんでした: ${missing.join(", ")}(パイプライン未実行の可能性)`);
  }

  const state: LayerState = { rail: true, stations: true, bus: false, ferry: true, air: true, ropeway: true };
  let era = CURRENT_YEAR;
  const render = () => {
    shell.overlay.setProps({ layers: buildTransitLayers(data, state, tooltip, era) });
  };
  render();

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
