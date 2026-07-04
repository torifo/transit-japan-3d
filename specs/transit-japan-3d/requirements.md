# Transit Japan 3D Requirements

## Overview

日本列島のすべての公共交通機関(鉄道・バス・航空・船・索道)を3Dマップでウェブ可視化する。
時代スライダーで過去の路線網(廃線含む)も表示できる。非商用・個人研究目的。
(詳細な経緯・データソース調査は docs/superpowers/specs/2026-07-04-transit-japan-3d-design.md を参照)

## User Stories

### US-001: 全国交通網の俯瞰
**As a** 閲覧者 **I want to** 全交通モードの路線網を3D地図で俯瞰したい **So that** 日本の交通網の全体像を掴める

**Acceptance Criteria:**
- WHEN ページを開いた THE SYSTEM SHALL 鉄道・駅・航路・空路・索道を3D地図(傾斜/回転可)に描画する
- WHEN レイヤートグルを操作した THE SYSTEM SHALL 該当モードの表示を切り替える
- WHEN 路線・駅・空港をホバー/タップした THE SYSTEM SHALL 名称と事業者をツールチップ表示する
- IF 一部データの取得に失敗した THEN THE SYSTEM SHALL 取得できたレイヤーのみで動作を継続しパネルに欠損を表示する

### US-002: 車両アニメーション
**As a** 閲覧者 **I want to** 時刻表どおりに動く車両を見たい **So that** いまの交通の流れを体感できる

**Acceptance Criteria:**
- WHEN 車両トグルをONにした THE SYSTEM SHALL GTFS時刻表から補間した車両位置を現在時刻で描画する
- WHEN 速度切替(1×〜300×/⏸)を操作した THE SYSTEM SHALL クロックの進行速度を変更する
- WHILE 過去年を表示中 THE SYSTEM SHALL 現代の車両を表示しない
- WHEN viewportを移動した THE SYSTEM SHALL 交差するフィードの時刻表を遅延ロードする

### US-003: 時代スライダー
**As a** 閲覧者 **I want to** 過去の年代に戻したい **So that** 廃線を含む当時の路線網を見られる

**Acceptance Criteria:**
- WHEN スライダーを過去年(1950〜)にした THE SYSTEM SHALL その年に存在した鉄道網のみを表示する
- IF 履歴データが未取得 THEN THE SYSTEM SHALL 現況の路線網を過去年として表示しない

### US-004: API連携(発車標・検索・経路)
**As a** 閲覧者 **I want to** 駅の発車時刻や場所検索を使いたい **So that** 実用的な交通情報が得られる

**Acceptance Criteria:**
- WHEN 駅をタップした THE SYSTEM SHALL api.transit.ls8h.com の発車標(愛称・行先・時刻)をパネル表示する
- WHEN 検索ボックスに入力した THE SYSTEM SHALL 駅・場所のサジェストを表示し選択で地図を移動する
- IF APIが不達 THEN THE SYSTEM SHALL ローカルデータのみで動作を継続する(縮退)

## Functional Requirements

### FR-001: データパイプライン
**Priority:** P0
THE SYSTEM SHALL 国土数値情報(N02/N05/N09/S10b/C28)・GTFS-JP全フィード・OSM Overpassからデータを再実行可能な形で取得・変換する

### FR-002: データ選定ポリシー
**Priority:** P0
IF データソースが一次ソースに遡れない・非構造化・ライセンス不明 THEN THE SYSTEM SHALL そのデータを採用しない

### FR-003: 出典表示
**Priority:** P0
THE SYSTEM SHALL 地理院タイル・国土数値情報の「加工して作成」表記とOSMのODbL表記を常時表示する

## Non-Functional Requirements
- Performance: モバイルで初期表示に読み込むGeoJSONは10MB未満(バス・時刻表・履歴は遅延ロード)
- Security: 外部データ由来文字列をinnerHTMLに渡さない(textContent構築)
- Compatibility: Chrome/Safari/Firefox、モバイル幅375pxで操作可能
