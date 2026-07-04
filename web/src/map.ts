import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";

// 地理院タイル(淡色)を基図に使う。出典表記は必須。
const GSI_PALE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";

export interface MapShell {
  map: maplibregl.Map;
  overlay: MapboxOverlay;
}

export function createMap(container: HTMLElement): Promise<MapShell> {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        gsi: {
          type: "raster",
          tiles: [GSI_PALE],
          tileSize: 256,
          maxzoom: 18,
          attribution:
            "<a href='https://maps.gsi.go.jp/development/ichiran.html'>地理院タイル</a>を加工して作成 / 「国土数値情報(N02・N09・S10b・C28)」(国土交通省)をもとに加工して作成 / 索道: © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors (ODbL)",
        },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b1020" } },
        {
          id: "gsi",
          type: "raster",
          source: "gsi",
          paint: { "raster-opacity": 0.55, "raster-saturation": -0.7, "raster-brightness-max": 0.7 },
        },
      ],
    },
    center: [138.5, 37.0],
    zoom: 5,
    pitch: 50,
    bearing: 0,
    maxPitch: 75,
    hash: true,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.GeolocateControl({}), "top-right");
  map.touchZoomRotate.enableRotation();

  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay as unknown as maplibregl.IControl);

  return new Promise((resolve) => {
    map.on("load", () => resolve({ map, overlay }));
  });
}
