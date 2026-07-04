export interface Tooltip {
  show(html: string, x: number, y: number): void;
  hide(): void;
}

export function setupTooltip(): Tooltip {
  const el = document.getElementById("tooltip")!;
  return {
    show(html, x, y) {
      el.innerHTML = html;
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
