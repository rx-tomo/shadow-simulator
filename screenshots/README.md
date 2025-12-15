# 日影シミュレータ スクリーンショット・GIF生成ツール

Puppeteerを使って自動的にスクリーンショットやGIFアニメーション用の連番画像を生成します。

## 必要なもの

- Node.js 18以上
- ffmpeg（GIF変換用、オプション）

## セットアップ

```bash
cd screenshots
npm install
```

## 使い方

### 1. スクリーンショット撮影

```bash
npm run capture
```

以下のシーンを自動撮影します：
- 初期表示
- 矩形描画モード
- 建物配置状態
- 高層ビル（20階）
- 朝の影（8:00）
- 夕方の影（17:00）
- 斜め視点
- ダークモード

出力先: `./output/`

### 2. GIFアニメーション用連番画像

```bash
npm run animation
```

6:00〜18:00まで15分刻みで連番画像を生成します（計49フレーム）。

出力先: `./output/animation/`

### 3. ffmpegでGIF変換

```bash
# 標準版（640px幅、約2MB）
ffmpeg -framerate 10 -i output/animation/frame_%03d.png \
  -vf "scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  output/shadow-animation.gif

# 高画質版（800px幅）
ffmpeg -framerate 10 -i output/animation/frame_%03d.png \
  -vf "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer" \
  output/shadow-animation-hq.gif

# 小サイズ版（480px幅、Web埋め込み向け）
ffmpeg -framerate 8 -i output/animation/frame_%03d.png \
  -vf "scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse" \
  output/shadow-animation-small.gif
```

### ffmpegのインストール（macOS）

```bash
brew install ffmpeg
```

## カスタマイズ

### capture-animation.js の設定

```javascript
const CONFIG = {
  startMinutes: 6 * 60,    // 開始時刻（6:00）
  endMinutes: 18 * 60,     // 終了時刻（18:00）
  intervalMinutes: 15,     // フレーム間隔（分）
  floors: 10,              // 建物の階数
  viewport: { width: 800, height: 600 },  // 画面サイズ
};
```

### 撮影シーンの追加

`capture.js` の `SCENES` 配列に新しいシーンを追加できます。

## 出力例

```
output/
├── 01_initial.png
├── 02_draw_mode.png
├── ...
├── animation/
│   ├── frame_000.png
│   ├── frame_001.png
│   └── ...
└── shadow-animation.gif
```
