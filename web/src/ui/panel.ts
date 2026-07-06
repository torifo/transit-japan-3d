import { FOCUS_LABELS, type FocusMode, type RouteRef } from "../modes";

export interface PinTarget {
  /** モード全体リンクの遷移先(現在のフォーカスと同じ場合はnullで非表示) */
  mode: FocusMode | null;
  /** 路線フォーカスリンクの対象(路線名が取れない地物はnull) */
  route: RouteRef | null;
  /** routeの属するモード(routeリンクの遷移先モード) */
  routeMode: FocusMode | null;
}

export interface Tooltip {
  show(title: string, subtitle: string, x: number, y: number): void;
  hide(): void;
  /** クリックで固定表示し、路線/モードへのリンクを出す。再クリックまでhover追従を止める */
  pin(title: string, subtitle: string, target: PinTarget, x: number, y: number): void;
  unpin(): void;
}

// OSM等の外部データ由来文字列を扱うためinnerHTMLは使わない(XSS対策)
export function setupTooltip(
  onFocusLink: (mode: FocusMode) => void,
  onRouteLink: (mode: FocusMode, route: RouteRef) => void,
): Tooltip {
  const el = document.getElementById("tooltip")!;
  const titleEl = document.createElement("strong");
  const subEl = document.createElement("span");
  subEl.className = "op";
  const routeLinkEl = document.createElement("button");
  routeLinkEl.type = "button";
  routeLinkEl.className = "focus-link";
  routeLinkEl.style.display = "none";
  const linkEl = document.createElement("button");
  linkEl.type = "button";
  linkEl.className = "focus-link";
  linkEl.style.display = "none";
  el.replaceChildren(titleEl, document.createElement("br"), subEl, routeLinkEl, linkEl);

  let pinned = false;
  let pinnedMode: FocusMode | null = null;
  let pinnedRoute: { mode: FocusMode; route: RouteRef } | null = null;
  linkEl.addEventListener("click", () => {
    if (pinnedMode) onFocusLink(pinnedMode);
  });
  routeLinkEl.addEventListener("click", () => {
    if (pinnedRoute) onRouteLink(pinnedRoute.mode, pinnedRoute.route);
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
    pin(title, subtitle, target, x, y) {
      pinned = true;
      pinnedMode = target.mode;
      pinnedRoute = target.route && target.routeMode ? { mode: target.routeMode, route: target.route } : null;
      titleEl.textContent = title;
      subEl.textContent = subtitle;
      if (pinnedRoute) {
        routeLinkEl.textContent = "▶ この路線を追う";
        routeLinkEl.style.display = "block";
      } else {
        routeLinkEl.style.display = "none";
      }
      if (target.mode) {
        linkEl.textContent = `▶ ${FOCUS_LABELS[target.mode]}モード全体`;
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
      pinnedRoute = null;
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
