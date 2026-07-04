# Phase 1-2: 足場 + 全国鉄道網3Dマップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vite+deck.gl+MapLibreの3Dウェブ地図に、国土数値情報N02-24の全国鉄道路線・駅を描画する(モバイル/PC対応)。

**Architecture:** `pipeline/` がN02-24 GML.zipをダウンロード→mapshaperでGeoJSON化・簡略化→`web/public/data/` に配置。`web/` はMapLibre GL(地理院タイル基図)+deck.gl MapboxOverlayでPathLayer/ScatterplotLayerを重ねる。サーバレス静的構成。

**Tech Stack:** Node 22, TypeScript, Vite, maplibre-gl, deck.gl (@deck.gl/mapbox), mapshaper(npx), vitest

---

### Task 1: リポジトリ足場

**Files:**
- Create: `package.json`(ルート, workspaces), `web/package.json`, `web/index.html`, `web/vite.config.ts`, `web/src/main.ts`, `web/src/map.ts`

- [ ] Step 1: ルートに npm workspaces (`web`, `pipeline`) を設定
- [ ] Step 2: `web` に vite + typescript + maplibre-gl + deck.gl を導入
- [ ] Step 3: `web/src/map.ts` — MapLibre地図(地理院淡色タイル、pitch=50, 東京中心)+ MapboxOverlay(interleaved)を初期化する `createMap()` を実装
- [ ] Step 4: `npm run dev` で3D傾斜地図が表示されることを確認(モバイルviewport meta含む)
- [ ] Step 5: Commit `feat: scaffold web app with 3D basemap`

### Task 2: 鉄道データパイプライン

**Files:**
- Create: `pipeline/package.json`, `pipeline/src/sources/ksj-n02.ts`(DL), `pipeline/src/build/rail.ts`(変換), `pipeline/test/rail.test.ts`

- [ ] Step 1: vitest で `classifyRail()`(N02属性→ {mode:'rail'|'tram'|'cable'|'ropeway', color} 分類)の失敗テストを書く
- [ ] Step 2: テスト失敗を確認
- [ ] Step 3: `ksj-n02.ts` — https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip を `data/raw/` にDL(キャッシュ付き)・unzip
- [ ] Step 4: `rail.ts` — mapshaper CLI(npx)でRailroadSection/Stationシェープファイル→GeoJSON化、`classifyRail()`で属性付与、座標精度削減、`web/public/data/rail-sections.geojson` と `rail-stations.geojson` を出力
- [ ] Step 5: テストpass確認、パイプライン実行しGeoJSON生成確認
- [ ] Step 6: Commit `feat: N02 railway data pipeline`

### Task 3: 鉄道レイヤー描画

**Files:**
- Create: `web/src/layers/rail.ts`, `web/src/ui/panel.ts`
- Modify: `web/src/main.ts`

- [ ] Step 1: PathLayer(路線、事業者種別で色分け)+ScatterplotLayer(駅)を実装、GeoJSONを fetch してoverlayへ
- [ ] Step 2: ホバー/タップで路線名・駅名ツールチップ
- [ ] Step 3: レイヤートグルUI(鉄道/駅)を追加、モバイルタッチ確認
- [ ] Step 4: Chrome/Safari/Firefoxで表示確認(verify skill)
- [ ] Step 5: Commit `feat: nationwide railway layers`

### Self-Review 済み

- spec Phase1-2をカバー。Phase3以降(バスGTFS・船・空路・索道・車両アニメ・時代スライダー・API連携)は後続プラン。
