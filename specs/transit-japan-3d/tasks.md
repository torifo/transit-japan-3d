# Transit Japan 3D Tasks

## Implementation Plan

### Wave 1 (完了) — 足場と鉄道
- [x] **Task 1.1**: Webアプリ足場(Vite+TS+MapLibre+deck.gl) — `web/`
- [x] **Task 1.2**: N02鉄道パイプライン(21,933区間・10,234駅) — `pipeline/src/build/rail.ts`

### Wave 2 (完了) — 全モードのデータ収集
- [x] **Task 2.1**: 航路N09(856) — `pipeline/src/build/ferry.ts`
- [x] **Task 2.2**: 空路S10b+空港C28(1,108アーク/97空港) — `pipeline/src/build/air.ts`
- [x] **Task 2.3**: 索道(OSM Overpass、190) — `pipeline/src/build/ropeway.ts`
- [x] **Task 2.4**: バスGTFS-JP全537フィード(バス停95,891・路線2,964) — `pipeline/src/build/bus.ts`
- [x] **Task 2.5**: 全モードレイヤー描画+HUDトグル — `web/src/layers/transit.ts`

### Wave 3 (完了) — 時間軸
- [x] **Task 3.1**: N05時系列パイプライン(2,645区間・23,812駅) — `pipeline/src/build/rail-history.ts`
- [x] **Task 3.2**: 時代スライダー(1950〜現在、廃線表示) — `web/src/main.ts`
- [x] **Task 3.3**: 時刻表集約(79,518便) — `pipeline/src/build/timetable.ts`
- [x] **Task 3.4**: 車両アニメーション(可変速クロック・viewport遅延ロード) — `web/src/anim/vehicles.ts`
- [x] **Task 3.5**: blueprintデザインHUD — `web/index.html`
- [x] **Task 3.6**: レビューWave1/2の修正適用(XSS・座標検証・in-flight管理ほか)

### Wave 4 (進行中) — API連携
- [ ] **Task 4.1**: openapi-typescript型生成+APIクライアント
  - What: /api/openapi.json から型生成、fetchラッパ(タイムアウト・縮退)
  - Files: `web/src/api/client.ts`, `web/src/api/schema.d.ts`
  - Done when: 型チェックpass、API不達でもアプリが動く
- [ ] **Task 4.2**: 駅タップ→発車標パネル
  - What: 駅クリック→places/reverse or 駅名suggest→stations/{id}/departures をHUDパネル表示
  - Files: `web/src/ui/station-panel.ts`, `web/src/main.ts`
  - Done when: 駅タップで愛称含む発車一覧が表示される(オフライン時は非表示)
- [ ] **Task 4.3**: 場所検索ボックス(places/suggest→flyTo)
  - Files: `web/index.html`, `web/src/ui/search.ts`
  - Done when: 「新宿」入力→候補選択→地図移動
- [ ] **Task 4.4**: 設定ドキュメント(docs/SETUP.md) — APIキー・起動手順・パイプライン一覧

### Wave 5 (未着手) — 拡張
- [ ] **Task 5.1**: PMTiles/タイル化(初期ロード軽量化)
- [ ] **Task 5.2**: named-trains(列車愛称)キュレーション+時代連動レイヤー
- [ ] **Task 5.3**: ODPT連携(JAL/ANAフライト時刻表・JR東時刻表、要APIキー)
- [ ] **Task 5.4**: 季節軸(月/日セレクタ、N09就航期間+GTFS calendar+OSM seasonal)
- [ ] **Task 5.5**: 都市部バス補完(ODPT等)
- [ ] **Task 5.6**: Wave3コードレビュー(Sonnet+Codex並列)

## Progress
- Total: 21 tasks | Completed: 13 | In Progress: Wave 4
