# セットアップと運用

## 必要環境

| 項目 | 要件 |
|---|---|
| Node.js | 22以上(fetch/AbortSignal.timeout使用) |
| unzip | macOS標準でOK(パイプラインが使用) |
| ディスク | data/raw/ に約1GB(GTFS 537フィード+国土数値情報) |

APIキー不要で動く範囲: 全パイプライン+Web本体+transit.ls8h.com連携(キー不要・CORS開放)。

## 起動

```bash
npm install            # ルートで1回(workspaces: web, pipeline)
npm run pipeline       # データ生成(初回必須、下記参照)
npm run dev            # Webアプリ http://localhost:5173 (このリポジトリの検証では --port 5183)
```

## データパイプライン

すべて冪等・キャッシュ付き(data/raw/)。再実行で最新データに更新される。

| コマンド | 生成物 | 所要目安 |
|---|---|---|
| `npx tsx pipeline/src/build/rail.ts` | 鉄道路線・駅(N02-2025) | 1分 |
| `npx tsx pipeline/src/build/rail-history.ts` | 鉄道時系列1950〜(N05) | 2分 |
| `npx tsx pipeline/src/build/ferry.ts` | 航路(N09) | 数秒 |
| `npx tsx pipeline/src/build/air.ts` | 空路・空港(S10b/C28) | 数秒 |
| `npx tsx pipeline/src/build/ropeway.ts` | 索道(OSM Overpass) | 1〜3分 |
| `npx tsx pipeline/src/build/bus.ts` | バス停・路線(GTFS-JP 537フィード) | 初回15〜30分/以後3分 |
| `npx tsx pipeline/src/build/timetable.ts` | 車両アニメ用時刻表(79,518便) | 初回15〜30分/以後5分 |

`--limit N` でフィード数を絞ったスモーク実行が可能(bus/timetable)。

### 追加GTFSフィード(gtfs-data.jp に無い事業者)

`data/raw/extra-gtfs/` にGTFS(-JP) zipを手動配置すると、bus.ts が通常フィードと
同様に処理してマージする。事業者名は agency.txt から取得(無ければzipファイル名)。

例: ちゅうバス(府中市コミュニティバス、京王バス受託)は gtfs-data.jp 非掲載。
ODPT「京王バス / Keio Bus」全路線GTFS-JPに含まれる:

1. https://developer.odpt.org/ でユーザー登録(無料)
2. https://ckan.odpt.org/dataset/keio_bus_all_lines から最新zipをDL
3. `data/raw/extra-gtfs/keio-bus.zip` として配置し `npx tsx pipeline/src/build/bus.ts` を再実行

ライセンス: 公共交通オープンデータ基本ライセンス(出典表記が必要。opフィールドに
事業者名を保持し、attributionはGTFS-JP各フィードの扱いに準ずる)。

## 外部API・キー

| サービス | キー | 用途 | 設定方法 |
|---|---|---|---|
| api.transit.ls8h.com | **不要** | 検索・発車標・経路・3D建物 | そのまま利用可(読み取り専用・CORS開放) |
| ODPT(公共交通オープンデータセンター) | **必要(無料)** | JAL/ANAフライト時刻表・JR東日本時刻表・都市部バス補完(未実装のWave 5) | developer.odpt.org で登録→ `pipeline/.env` に `ODPT_CONSUMER_KEY=...` を置く(gitignore済み想定。実装時に読み込み処理を追加) |
| e-Stat(政府統計) | 必要(無料) | 航空輸送統計の年次取得(未実装) | www.e-stat.go.jp でアプリケーションID発行 |

## 出典・ライセンス(表示義務)

- 地理院タイル: 「地理院タイルを加工して作成」表記(web/src/map.ts のattributionに設定済み)
- 国土数値情報(N02/N05/N09/S10b/C28): 「〜をもとに加工して作成」表記(同上)
- OpenStreetMap: © OpenStreetMap contributors (ODbL)(同上)
- GTFS-JP各フィード: 大半がCC BY 4.0。事業者名はデータのopフィールドに保持
- データ選定ポリシー: specs/transit-japan-3d/requirements.md FR-002 参照

## 開発規約

- git: ローカルconfigで user=torifo / progbot.clover@gmail.com(グローバル設定禁止)
- コミット: EN+`---`+JAの二言語形式、AI帰属行なし、アトミック粒度
- SDD: specs/transit-japan-3d/{requirements,design,tasks}.md を更新しながら進める
- テスト: `cd pipeline && npx vitest run`(15件) / 型: `cd web && npx tsc --noEmit`
