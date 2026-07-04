import type maplibregl from "maplibre-gl";
import { suggestPlaces } from "../api/client";

// 場所検索ボックス: places/suggest → 候補選択で flyTo

export function setupSearch(map: maplibregl.Map): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const results = document.getElementById("search-results")!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 入力イベントごとに世代を進め、古いレスポンスを確実に破棄する
  let seq = 0;

  const clear = () => {
    results.replaceChildren();
    results.style.display = "none";
  };

  input.addEventListener("input", () => {
    const q = input.value.trim();
    const mySeq = ++seq;
    clearTimeout(timer);
    if (q.length < 2) {
      clear();
      return;
    }
    timer = setTimeout(async () => {
      const res = await suggestPlaces(q);
      if (!res || mySeq !== seq) return; // 古いレスポンスは破棄
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
