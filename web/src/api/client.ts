import type { components } from "./schema";

// api.transit.ls8h.com クライアント。読み取り専用・CORS開放・キー不要。
// API不達でもアプリ本体は動くよう、失敗は全てnullで返す(縮退)

const BASE = "https://api.transit.ls8h.com/api/v1";
const TIMEOUT_MS = 8000;

export type PlaceSuggestResponse = components["schemas"]["PlaceSuggestResponse"];
export type PlaceReverseResponse = components["schemas"]["PlaceReverseResponse"];
export type DeparturesResponse = components["schemas"]["DeparturesResponse"];
export type Place = PlaceReverseResponse["places"][number];
export type Departure = DeparturesResponse["departures"][number];

async function get<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
  try {
    const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type LocationSuggestResponse = components["schemas"]["SuggestResponse"];
export type StationLocation = LocationSuggestResponse["stations"][number];

export function suggestPlaces(q: string, limit = 6): Promise<PlaceSuggestResponse | null> {
  return get("/places/suggest", { q, limit });
}

/** 駅名→フィード修飾の駅ID候補(発車標APIが受けるID形式) */
export function suggestLocations(q: string, limit = 10): Promise<LocationSuggestResponse | null> {
  return get("/locations/suggest", { q, limit });
}

export function reversePlaces(lat: number, lon: number, radiusMeters = 400): Promise<PlaceReverseResponse | null> {
  return get("/places/reverse", { lat, lon, radiusMeters, limit: 5 });
}

export function stationDepartures(id: string, limit = 12): Promise<DeparturesResponse | null> {
  return get(`/stations/${encodeURIComponent(id)}/departures`, { limit });
}
