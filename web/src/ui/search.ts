import type maplibregl from "maplibre-gl";
import { suggestPlaces } from "../api/client";

// 場所検索ボックス: places/suggest → 候補選択で flyTo

export function setupSearch(map: maplibregl.Map): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const results = document.getElementById("search-results")!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastQuery = "";

  const clear = () => {
    results.replaceChildren();
    results.style.display = "none";
  };

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) {
      clear();
      return;
    }
    timer = setTimeout(async () => {
      lastQuery = q;
      const res = await suggestPlaces(q);
      if (!res || lastQuery !== q) return; // 古いレスポンスは破棄
      results.replaceChildren();
      for (const p of res.places.slice(0, 6)) {
        if (p.lat == null || p.lon == null) continue;
        const item = document.createElement("button");
        item.type = "button";
        item.className = "search-item";
        item.textContent = p.name + (p.kind === "station" ? " 駅" : "");
        item.addEventListener("click", () => {
          map.flyTo({ center: [p.lon!, p.lat!], zoom: 13.5, pitch: 55 });
          input.value = p.name;
          clear();
        });
        results.appendChild(item);
      }
      results.style.display = results.childElementCount > 0 ? "block" : "none";
    }, 250);
  });

  input.addEventListener("blur", () => setTimeout(clear, 200));
}
