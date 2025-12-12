# 実装計画（MVP → 拡張）

## フェーズ構成
### Phase 1: 雛形 / 画面レイアウト
- 静的構成（`docs/index.html`, `docs/app.js`, `docs/styles.css`）
- MapLibre 地図表示
- サイドパネルUI（場所/建物/日時/表示/結果）

### Phase 2: 回転矩形の描画・編集
- TerraDraw（UMD）+ MapLibre Adapter を使用
- 描画モード: 矩形（クリック→移動→クリック）
- 選択・編集（移動/拡縮）

### Phase 3: 高さ↔階数連動、日時/タイムゾーン
- 高さ(m)と階数(1–100)の双方向同期
- 1階あたり高さ（デフォルト3.1m、調整可）
- 日付/時刻UI、分スライダー
- タイムゾーン（IANA）選択、LuxonでDST自動処理

### Phase 4: 太陽位置・影ポリゴン算出と描画
- SunCalcで太陽高度/方位算出
- 影長 `L = H / tan(altitude)`
- Web Mercatorメートル座標に投影し影ポリゴン生成
- 影GeoJSONを地図に半透明描画

### Phase 5: UX磨き込み / 拡張
- 1日再生/停止、季節プリセット
- 複数建物対応、localStorage保存
- 3D押し出し表現の改善
- 地形/周辺建物の高度化（後続）

## 主要依存
- MapLibre GL JS（CDN）
- CARTO Basemaps raster tiles（voyager/light/dark）
- TerraDraw + terra-draw-maplibre-gl-adapter（矩形）
- Luxon（タイムゾーン/DST）
- SunCalc（太陽位置）
- Nominatim（地名/住所検索）
