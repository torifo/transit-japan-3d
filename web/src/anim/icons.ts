// 車両アニメ用のアイコンセット。Material Symbols系の乗り物グリフを
// route_type色の円バッジに白抜きで載せたSVGをdata URLとして生成する
// (外部fetch不要・IconLayerのURL単位キャッシュが効く)

export interface VehicleIcon {
  url: string;
  width: number;
  height: number;
}

const SIZE = 48;

// GTFS route_type: 0=tram 1=metro 2=rail 3=bus 4=ferry / 1100前後=air(将来用)
const GLYPHS: Record<string, string> = {
  rail: "M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  tram: "M19 16.94V8.5c0-2.79-2.61-3.4-6.01-3.49l.76-1.51H17V2H7v1.5h4.75l-.76 1.52C7.86 5.11 5 5.73 5 8.5v8.44c0 1.45 1.19 2.66 2.59 2.97L6 21.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 20h-.08c1.69 0 2.58-1.37 2.58-3.06zM12 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5-4.5H7V9h10v5z",
  bus: "M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z",
  ferry:
    "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z",
  air: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
};

// vehicles.ts の TYPE_COLORS と同系色(視認性のため彩度は少し上げる)
const BADGE_COLORS: Record<string, string> = {
  tram: "#ff6384",
  metro: "#ba68c8",
  rail: "#5b8cff",
  bus: "#ffca28",
  ferry: "#4dd0e1",
  air: "#f06292",
};

function svgDataUrl(glyph: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="11" fill="${color}" stroke="#0b1020" stroke-width="1.5"/>` +
    `<g transform="translate(4.8,4.8) scale(0.6)"><path d="${glyph}" fill="#0b1020"/></g>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function icon(kind: keyof typeof GLYPHS, colorKey: string): VehicleIcon {
  return { url: svgDataUrl(GLYPHS[kind], BADGE_COLORS[colorKey]), width: SIZE, height: SIZE };
}

/** GTFS route_type → アイコン */
const BY_TYPE: Record<number, VehicleIcon> = {
  0: icon("tram", "tram"),
  1: icon("rail", "metro"),
  2: icon("rail", "rail"),
  3: icon("bus", "bus"),
  4: icon("ferry", "ferry"),
};

const AIR_ICON = icon("air", "air");
const FALLBACK = BY_TYPE[3];

export function vehicleIcon(routeType: number): VehicleIcon {
  if (routeType >= 1100 && routeType < 1200) return AIR_ICON; // 拡張route_type: 航空
  return BY_TYPE[routeType] ?? FALLBACK;
}
