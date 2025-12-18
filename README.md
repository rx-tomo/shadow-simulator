# 日影シミュレータ（ブラウザのみ / MVP）

<div align="center">
  <video src="assets/demo1.mp4" width="45%" autoplay loop muted playsinline></video>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <video src="assets/demo2.mp4" width="45%" autoplay loop muted playsinline></video>
</div>

https://rx-tomo.github.io/shadow-simulator/

地図上で敷地（矩形）と建物高さを設定し、指定日時の太陽位置から日影範囲を表示するツールです。
サーバ不要の静的アプリとして動作します。

こうしたアプリは他にもあるようですが、探すよりもChatGPTで先に作ってしまいました。
GPT Codex 5.1で3回くらいのプロンプトで今のレベルまで1時間以内で作れました。



## できること（MVP）
- MapLibre の地図表示（ベースマップ切替）
- 矩形で建物フットプリント作成／編集
- 高さ(m)と階数（最大100階）の双方向連動
- 日付・時刻・タイムゾーン指定
- 視点（ピッチ/ベアリング）変更と周回ビュー
- 1日再生（開始/停止トグル）
- 夜間（太陽高度<=0）オーバーレイ表示

## 使い方
1. GitHub Pages（推奨）で開くか、ローカルでHTTP配信して開きます（`file://` は環境により動かない場合があります）。
2. 「矩形を描く」→ 地図上を「クリック→移動→クリック」で建物を配置。
3. 高さ/階数、日付/時刻、タイムゾーンを調整。

※ GitHub Pages で `/docs` をルートにして公開する想定です。ローカル配信は `docs/DEV.md` を参照してください。

## 外部サービスと利用条件（重要）
このアプリはサーバを持たないため、各ユーザのブラウザから外部サービスへ直接リクエストします。公開して不特定多数が利用すると、提供元の利用規約・レート制限に抵触したり、ブロックされる可能性があります。

利用している主な外部サービス:
- **ベースマップ（地図タイル）**: CARTO Basemaps（`voyager` / `light` / `dark`）
  - APIキー不要ですが、提供元の利用規約・フェアユースに従う必要があります（大量アクセスでは制限/遮断され得ます）。
  - 出典表示（attribution）は画面左下に表示しています。
  - 参考: `https://carto.com/attribution`（利用規約は同サイトのLegal参照）
- **地名/住所検索（ジオコーディング）**: Nominatim（OpenStreetMap）
  - 公開Nominatimには利用方針があり、**高トラフィックの公開サービス用途には不向き**です。アクセス増加時はブロックされる可能性があります。
  - 参考: `https://operations.osmfoundation.org/policies/nominatim/` / `https://nominatim.org/release-docs/latest/api/Overview/`
- **CDN（ライブラリ配信）**: jsDelivr（MapLibre / TerraDraw / Luxon / SunCalc）
  - APIキー不要ですが、提供条件や帯域制限の影響を受ける可能性があります。
  - 参考: `https://www.jsdelivr.com/terms`

### 公開サービスとして運用する場合の推奨
- ジオコーディングは、商用/公開利用が許容されたサービス（APIキー方式など）へ切替、または自前ホストを検討
- タイルは提供元と契約するか、自前/別プロバイダへ切替（アクセス増に備える）
- 依存JS/CSSは `docs/` 配下に同梱してCDN依存を減らす（長期運用の安定性向上）

※ ここでの説明は一般的な注意喚起であり、法的助言ではありません。各サービスの最新の利用規約/ポリシーを必ず確認してください。

## ドキュメント
- `docs/PLAN.md` 実装計画
- `docs/SPEC.md` 仕様
- `docs/DEV.md` 開発・配布メモ
