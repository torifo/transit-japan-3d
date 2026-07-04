import { createMap } from "./map";
import { buildTransitLayers, loadTransitData, type LayerState } from "./layers/transit";
import { setupTooltip, showError } from "./ui/panel";

async function init() {
  const shell = await createMap(document.getElementById("map")!);
  const tooltip = setupTooltip();

  const { data, missing } = await loadTransitData();
  if (missing.length > 0) {
    showError(`一部データを取得できませんでした: ${missing.join(", ")}(パイプライン未実行の可能性)`);
  }

  const state: LayerState = { rail: true, stations: true, ferry: true, air: true, ropeway: true };
  const render = () => {
    shell.overlay.setProps({ layers: buildTransitLayers(data, state, tooltip) });
  };
  render();

  for (const key of Object.keys(state) as (keyof LayerState)[]) {
    const el = document.getElementById(`toggle-${key}`) as HTMLInputElement | null;
    el?.addEventListener("change", () => {
      state[key] = el.checked;
      render();
    });
  }
}

init();
