# Transit Japan 3D

日本全国の公共交通（鉄道・バス・航路・空路・索道）をブラウザ上の3D地図に描画する
可視化アプリ。オープンデータのみで構築されており、APIキーなしで動作します。

Interactive 3D map of Japan's public transport network — rail, bus, ferry,
air and ropeway — built entirely from open data.

## 特徴

- **全国の交通網を一枚の地図に**: 鉄道路線・駅、バス路線・停留所（GTFS-JP 537フィード）、
  フェリー航路、国内空路（国際線は任意表示）、索道
- **モード特化ビュー**: 路線をクリック、またはパネルの「→」から各モードに特化した
  表示へ切替（視点・強調スタイルを自動調整、URLで共有可能）
- **年代スライダー**: 1950年〜現在の鉄道網の変遷を表示（国土数値情報N05時系列）。
  空路は民間航空が再開した1951年以降のみ表示
- **車両アニメーション**: GTFS時刻表を補間して現在時刻の車両位置を描画
- **駅の発車標・場所検索**: api.transit.ls8h.com 連携（キー不要）

## 使い方

```bash
npm install       # ルートで1回(workspaces: web, pipeline)
npm run dev       # http://localhost:5173
```

生成済みデータはリポジトリに同梱されています。データを最新化する場合は
`npm run pipeline` を実行してください（初回は30分程度、詳細は
[docs/SETUP.md](docs/SETUP.md)）。

ちゅうバス等、gtfs-data.jp に無い事業者の追加取り込み手順も
[docs/SETUP.md](docs/SETUP.md) に記載しています。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `web/` | フロントエンド（Vite + TypeScript + MapLibre GL + deck.gl） |
| `pipeline/` | データ生成（国土数値情報・GTFS-JP・OSM → GeoJSON/時刻表JSON） |
| `docs/` | セットアップ・運用ガイド、設計ドキュメント |
| `specs/` | SDD仕様（requirements / design / tasks） |

## データ出典

本アプリは以下のオープンデータを加工して利用しています（表示中の地図にも出典を表記）。

- [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）
- 国土数値情報 N02（鉄道）・N05（鉄道時系列）・N09（航路）・S10b（空港間流通量）・
  C28（空港）（国土交通省）
- GTFS-JP各フィード（[GTFSデータリポジトリ](https://gtfs-data.jp/)、大半がCC BY 4.0。
  事業者名はデータの `op` フィールドに保持）
- 索道: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- 検索・発車標: [api.transit.ls8h.com](https://api.transit.ls8h.com)

非商用の公開を目的としたプロジェクトです。データの再利用時は各出典元の
ライセンスに従ってください。
