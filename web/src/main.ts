import { createMap } from "./map";
import { buildTransitLayers, loadTransitData, type LayerState, type TransitData } from "./layers/transit";
import { setupTooltip } from "./ui/panel";

async function init() {
  const shell = await createMap(document.getElementById("map")!);
  const tooltip = setupTooltip();

  let data: TransitData | null = null;
  try {
    data = await loadTransitData();
  } catch (e) {
    console.warn("[transit3d] transit data not available yet — run the pipeline first", e);
    return;
  }

  const state: LayerState = { rail: true, stations: true, ferry: true, air: true, ropeway: true };
  const render = () => {
    shell.overlay.setProps({ layers: buildTransitLayers(data!, state, tooltip) });
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
