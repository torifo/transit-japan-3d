export interface Tooltip {
  show(title: string, subtitle: string, x: number, y: number): void;
  hide(): void;
}

// OSM等の外部データ由来文字列を扱うためinnerHTMLは使わない(XSS対策)
export function setupTooltip(): Tooltip {
  const el = document.getElementById("tooltip")!;
  const titleEl = document.createElement("strong");
  const subEl = document.createElement("span");
  subEl.className = "op";
  el.replaceChildren(titleEl, document.createElement("br"), subEl);
  return {
    show(title, subtitle, x, y) {
      titleEl.textContent = title;
      subEl.textContent = subtitle;
      el.style.display = "block";
      const pad = 12;
      const w = el.offsetWidth;
      const left = x + pad + w > window.innerWidth ? x - w - pad : x + pad;
      el.style.left = `${Math.max(4, left)}px`;
      el.style.top = `${y + pad}px`;
    },
    hide() {
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
