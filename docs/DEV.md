# 開発・配布メモ

## ローカル実行
`docs/index.html` を直接開いて動作する構成にしています。  
ブラウザや環境によって `file://` だとタイル取得やWorkerで制限が出る場合があります。

その場合は以下のいずれかを推奨します（GitHub Pages `/docs` ルート推奨）。

### A) 静的ホスティング
GitHub Pages / Netlify / Vercel などに `docs/` 一式を置いて開く。

### B) 簡易サーバ
任意のHTTPサーバでこのディレクトリを配信する。  
（例: `python -m http.server` 等。要求はしませんが必要なら使ってください。）

## 外部サービス（注意）
本アプリはサーバを持たない静的構成のため、ブラウザから直接外部サービスへアクセスします。

- 地図タイル: CARTO Basemaps（`voyager` / `light` / `dark`）
- 検索: Nominatim（OpenStreetMap）
- CDN: jsDelivr（MapLibre / TerraDraw / Luxon / SunCalc）

公開して不特定多数が利用する場合、提供元の利用規約やレート制限によりブロックされる可能性があります。  
運用規模が大きくなる場合は、タイル/ジオコーディングの提供元を契約/自前へ切替することを検討してください。
