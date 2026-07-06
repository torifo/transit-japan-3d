# Transit Japan 3D

<!-- tech-stack:start (auto-generated) -->
<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/MapLibre GL-396CB2?style=for-the-badge&logo=maplibre&logoColor=white" alt="MapLibre GL">
</p>
<!-- tech-stack:end -->

日本全国の公共交通を一枚の3D地図に描く可視化アプリです。
**鉄道・バス・航路・空路・索道**をオープンデータのみで描画し、**APIキーなし**で動作します。

## 特徴

- **全国の交通網を一枚の地図に**: 鉄道路線・駅、バス路線・停留所（GTFS-JP 537フィード）、フェリー航路、国内空路（国際線は任意表示）、索道
- **モード特化ビュー**: 路線クリックまたはパネルの「→」から各モード特化表示へ切替。視点・強調スタイルを自動調整し、**URLで共有可能**（`&mode=rail` 等）
- **年代スライダー**: 1950年〜現在の鉄道網の変遷を表示（国土数値情報N05時系列）。空路は民間航空が再開した**1951年以降のみ**表示
- **車両アニメーション**: GTFS時刻表を補間して現在時刻の車両位置を描画（1×〜300×再生）
- **駅の発車標・場所検索**: [api.transit.ls8h.com](https://api.transit.ls8h.com) 連携（キー不要）

## 使い方

```bash
npm install       # ルートで1回(workspaces: web, pipeline)
npm run dev       # → http://localhost:5173
```

生成済みデータはリポジトリに同梱しています。最新化する場合のみパイプラインを実行します。

```bash
npm run pipeline  # データ再生成(初回30分程度、以後キャッシュで短縮)
npm test          # pipelineのテスト
npm run build     # 型チェック + 本番ビルド(web/dist)
```

ちゅうバス等、gtfs-data.jp に無い事業者の追加取り込み手順は [docs/SETUP.md](docs/SETUP.md) を参照。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `web/` | フロントエンド（MapLibre GL + deck.gl） |
| `pipeline/` | データ生成（国土数値情報・GTFS-JP・OSM → GeoJSON/時刻表JSON） |
| `docs/` | セットアップ・運用ガイド、設計ドキュメント |
| `specs/` | SDD仕様（requirements / design / tasks） |

## Deploy

GitHub Actions（[build.yml](.github/workflows/build.yml)）が `main` への push でテスト＋ビルドし、`web/dist` を artifact 化します。GitHub Pages で公開する場合はリポジトリ変数 `BASE_PATH=/リポジトリ名/` を設定し、workflow 内の Pages デプロイジョブを有効化します（サブパス公開対応済み）。

## データ出典

本アプリは以下のオープンデータを加工して利用しています（地図上にも出典を表記）。

- [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）
- 国土数値情報 N02（鉄道）・N05（鉄道時系列）・N09（航路）・S10b（空港間流通量）・C28（空港）（国土交通省）
- GTFS-JP各フィード（[GTFSデータリポジトリ](https://gtfs-data.jp/)、大半がCC BY 4.0。事業者名はデータの `op` フィールドに保持）
- 索道: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)

非商用の公開を目的としたプロジェクトです。データの再利用時は各出典元のライセンスに従ってください。
