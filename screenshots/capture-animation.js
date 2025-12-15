/**
 * 日影シミュレータ GIFアニメーション用連番画像生成
 *
 * 使い方:
 *   cd screenshots
 *   npm install
 *   npm run animation
 *
 * 出力: ./output/animation/ に連番PNGが保存されます
 *
 * GIF変換 (ffmpegが必要):
 *   ffmpeg -framerate 10 -i output/animation/frame_%03d.png -vf "scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output/shadow-animation.gif
 */

import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const APP_URL = "https://rx-tomo.github.io/shadow-simulator/";
const OUTPUT_DIR = "./output/animation";

// アニメーション設定
const CONFIG = {
  // 開始・終了時刻（分）
  startMinutes: 6 * 60, // 6:00
  endMinutes: 18 * 60, // 18:00
  // フレーム間隔（分）
  intervalMinutes: 15,
  // 建物の階数
  floors: 10,
  // ビューポートサイズ
  viewport: { width: 800, height: 600 },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function minutesToTimeString(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function main() {
  console.log("日影シミュレータ アニメーション連番画像生成開始...\n");

  // 出力ディレクトリ作成
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport(CONFIG.viewport);

  try {
    console.log("ページ読み込み中...");
    await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await wait(3000);

    // 建物を配置
    console.log("建物を配置中...");
    await page.click("#drawRectButton");
    await wait(300);

    const mapEl = await page.$("#map");
    const box = await mapEl.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.click(centerX - 40, centerY - 25);
    await wait(300);
    await page.mouse.click(centerX + 40, centerY + 25);
    await wait(500);

    // 選択モードにして建物を選択
    await page.click("#selectButton");
    await wait(300);
    await page.mouse.click(centerX, centerY);
    await wait(300);

    // 階数を設定
    await page.$eval(
      "#floorsInput",
      (el, floors) => {
        el.value = String(floors);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      CONFIG.floors
    );
    await wait(500);

    // パネルを閉じてマップを広く表示（オプション）
    // await page.click("#panelToggle");
    // await wait(300);

    // 斜め視点に切替
    await page.click('button[data-view="oblique"]');
    await wait(1500);

    // 時間ごとにスクリーンショット撮影
    let frameIndex = 0;
    const totalFrames = Math.ceil(
      (CONFIG.endMinutes - CONFIG.startMinutes) / CONFIG.intervalMinutes
    );

    console.log(`\n${totalFrames}フレーム撮影開始...\n`);

    for (
      let minutes = CONFIG.startMinutes;
      minutes <= CONFIG.endMinutes;
      minutes += CONFIG.intervalMinutes
    ) {
      const timeStr = minutesToTimeString(minutes);

      // 時刻を設定
      await page.$eval(
        "#timeInput",
        (el, time) => {
          el.value = time;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        },
        timeStr
      );

      // 日影の再計算を待つ
      await wait(300);

      // スクリーンショット撮影
      const filename = `frame_${String(frameIndex).padStart(3, "0")}.png`;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, filename),
        fullPage: false,
      });

      console.log(`  [${frameIndex + 1}/${totalFrames}] ${timeStr} -> ${filename}`);
      frameIndex++;
    }

    console.log(`\n連番画像生成完了!`);
    console.log(`出力先: ${path.resolve(OUTPUT_DIR)}`);
    console.log(`\n--- GIF変換コマンド ---`);
    console.log(
      `ffmpeg -framerate 10 -i ${OUTPUT_DIR}/frame_%03d.png -vf "scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output/shadow-animation.gif`
    );
    console.log(`\n高画質版:`);
    console.log(
      `ffmpeg -framerate 10 -i ${OUTPUT_DIR}/frame_%03d.png -vf "scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer" output/shadow-animation-hq.gif`
    );
  } catch (err) {
    console.error(`エラー: ${err.message}`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch(console.error);
