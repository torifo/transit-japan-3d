import { reversePlaces, stationDepartures, suggestLocations, type Departure } from "../api/client";

// 駅タップ→発車標パネル(blueprint HUDトーン)。全てtextContentで構築(XSS対策)

// 24時超は鉄道慣習どおり「25:10」形式で表示(深夜便を翌日と誤読させない)
const fmtTime = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export class StationPanel {
  private el: HTMLElement;
  // 連打時に古いレスポンスで上書きしないための世代カウンタ
  private requestSeq = 0;

  constructor() {
    this.el = document.getElementById("station-panel")!;
    this.el.querySelector(".close")!.addEventListener("click", () => this.hide());
  }

  hide() {
    this.el.style.display = "none";
  }

  /**
   * 駅の発車標を表示する。
   * name(自前レイヤーの駅名)があれば locations/suggest で同名駅のうち最近傍のIDを解決、
   * 無ければ places/reverse の transit ソース駅にフォールバック。該当なしなら何もしない。
   */
  async showAt(lat: number, lon: number, name?: string | null): Promise<void> {
    const seq = ++this.requestSeq;
    let stationId: string | null = null;
    let stationName: string | null = null;

    if (name) {
      // 同名駅が多い駅名(本町・中央等)で真の最近傍を取りこぼさないよう多めに取得
      const loc = await suggestLocations(name, 20);
      if (seq !== this.requestSeq) return;
      const near = (loc?.stations ?? [])
        .filter((s) => s.lat != null && s.lon != null)
        .map((s) => ({ s, d: (s.lat! - lat) ** 2 + ((s.lon! - lon) * Math.cos((lat * Math.PI) / 180)) ** 2 }))
        .sort((a, b) => a.d - b.d)[0];
      // 約2km以内の同名駅のみ採用(遠方の同名駅を誤って拾わない)
      if (near && Math.sqrt(near.d) * 111 < 2) {
        stationId = near.s.id;
        stationName = near.s.name;
      }
    }
    if (!stationId) {
      const rev = await reversePlaces(lat, lon);
      if (seq !== this.requestSeq) return;
      // OSM/ジオコーダ由来のidは発車標APIの駅IDではないため、transitソースの駅のみ対象
      const station = rev?.places.find((p) => p.source === "transit" && (p.kind === "station" || p.kind === "stop"));
      if (!station) return;
      stationId = station.id;
      stationName = station.name;
    }

    const title = this.el.querySelector(".sp-title")!;
    const list = this.el.querySelector(".sp-list")!;
    title.textContent = stationName ?? "";
    const loading = document.createElement("div");
    loading.className = "sp-row sp-empty";
    loading.textContent = "読込中…";
    list.replaceChildren(loading);
    this.el.style.display = "block";

    const dep = await stationDepartures(stationId);
    if (seq !== this.requestSeq) return;
    list.replaceChildren();
    if (!dep || dep.departures.length === 0) {
      const li = document.createElement("div");
      li.className = "sp-row sp-empty";
      li.textContent = dep ? "本日の発車情報なし" : "発車情報を取得できません(オフライン?)";
      list.replaceChildren(li);
      return;
    }
    for (const d of dep.departures as Departure[]) {
      list.appendChild(this.row(d));
    }
  }

  private row(d: Departure): HTMLElement {
    const row = document.createElement("div");
    row.className = "sp-row";
    const time = document.createElement("span");
    time.className = "sp-time";
    time.textContent = d.headwayBased && d.headwaySecs ? `約${Math.round(d.headwaySecs / 60)}分毎` : fmtTime(d.departureSecs);
    const type = document.createElement("span");
    type.className = "sp-type";
    type.textContent = d.trainType ?? "";
    if (d.color) type.style.color = `#${d.color.replace(/^#/, "")}`;
    const dest = document.createElement("span");
    dest.className = "sp-dest";
    dest.textContent = `${d.routeName}${d.headsign ? " " + d.headsign + "行" : ""}`;
    row.append(time, type, dest);
    return row;
  }
}
