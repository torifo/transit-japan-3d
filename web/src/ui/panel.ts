import { FOCUS_LABELS, type FocusMode } from "../modes";

export interface Tooltip {
  show(title: string, subtitle: string, x: number, y: number): void;
  hide(): void;
  /** クリックで固定表示し、モード特化ビューへのリンクを出す。再クリックまでhover追従を止める */
  pin(title: string, subtitle: string, mode: FocusMode | null, x: number, y: number): void;
  unpin(): void;
}

// OSM等の外部データ由来文字列を扱うためinnerHTMLは使わない(XSS対策)
export function setupTooltip(onFocusLink: (mode: FocusMode) => void): Tooltip {
  const el = document.getElementById("tooltip")!;
  const titleEl = document.createElement("strong");
  const subEl = document.createElement("span");
  subEl.className = "op";
  const linkEl = document.createElement("button");
  linkEl.type = "button";
  linkEl.className = "focus-link";
  linkEl.style.display = "none";
  el.replaceChildren(titleEl, document.createElement("br"), subEl, linkEl);

  let pinned = false;
  let pinnedMode: FocusMode | null = null;
  linkEl.addEventListener("click", () => {
    if (pinnedMode) onFocusLink(pinnedMode);
  });

  const place = (x: number, y: number) => {
    el.style.display = "block";
    const pad = 12;
    const w = el.offsetWidth;
    const left = x + pad + w > window.innerWidth ? x - w - pad : x + pad;
    el.style.left = `${Math.max(4, left)}px`;
    el.style.top = `${y + pad}px`;
  };

  return {
    show(title, subtitle, x, y) {
      if (pinned) return;
      titleEl.textContent = title;
      subEl.textContent = subtitle;
      linkEl.style.display = "none";
      place(x, y);
    },
    hide() {
      if (pinned) return;
      el.style.display = "none";
    },
    pin(title, subtitle, mode, x, y) {
      pinned = true;
      pinnedMode = mode;
      titleEl.textContent = title;
      subEl.textContent = subtitle;
      if (mode) {
        linkEl.textContent = `▶ ${FOCUS_LABELS[mode]}モードで見る`;
        linkEl.style.display = "block";
      } else {
        linkEl.style.display = "none";
      }
      el.classList.add("pinned");
      place(x, y);
    },
    unpin() {
      pinned = false;
      pinnedMode = null;
      el.classList.remove("pinned");
      el.style.display = "none";
    },
  };
}

export function showError(message: string) {
  const panel = document.getElementById("panel")!;
  const err = document.createElement("div");
  err.style.cssText = "color:#ff8a80;margin-top:6px;font-size:12px;";
  err.textContent = message;
  panel.appendChild(err);
}
