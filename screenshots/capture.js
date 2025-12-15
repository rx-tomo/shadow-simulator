/**
 * 日影シミュレータのスクリーンショット撮影スクリプト
 *
 * 使い方:
 *   cd screenshots
 *   npm install
 *   npm run capture
 *
 * 出力: ./output/ にスクリーンショットが保存されます
 */

import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const APP_URL = "https://rx-tomo.github.io/shadow-simulator/";
const OUTPUT_DIR = "./output";

// 撮影シーン定義
const SCENES = [
  {
    name: "01_initial",
    description: "初期表示（地図のみ）",
    setup: async (page) => {
      // 初期状態なのでそのまま
      await wait(1000);
    },
  },
  {
    name: "02_draw_mode",
    description: "矩形描画モード",
    setup: async (page) => {
      await page.click("#drawRectButton");
      await wait(500);
    },
  },
  {
    name: "03_building_placed",
    description: "建物を配置した状態",
    setup: async (page) => {
      // 矩形を描画（2点クリック）
      await page.click("#drawRectButton");
      await wait(300);

      const mapEl = await page.$("#map");
      const box = await mapEl.boundingBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      // 1点目クリック
      await page.mouse.click(centerX - 50, centerY - 30);
      await wait(300);
      // 2点目クリック
      await page.mouse.click(centerX + 50, centerY + 30);
      await wait(1000);
    },
  },
  {
    name: "04_tall_building",
    description: "高層ビル（20階）",
    setup: async (page) => {
      // まず建物を描画
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

      // 階数を20に設定
      await page.$eval("#floorsInput", (el) => {
        el.value = "20";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await wait(1000);
    },
  },
  {
    name: "05_morning_shadow",
    description: "朝の影（8:00）",
    setup: async (page) => {
      // 建物配置
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

      // 時刻を8:00に設定
      await page.$eval("#timeInput", (el) => {
        el.value = "08:00";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await wait(1000);
    },
  },
  {
    name: "06_evening_shadow",
    description: "夕方の影（17:00）",
    setup: async (page) => {
      // 建物配置
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

      // 時刻を17:00に設定
      await page.$eval("#timeInput", (el) => {
        el.value = "17:00";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await wait(1000);
    },
  },
  {
    name: "07_oblique_view",
    description: "斜め視点",
    setup: async (page) => {
      // 建物配置
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

      // 斜め視点ボタンをクリック
      await page.click('button[data-view="oblique"]');
      await wait(1500);
    },
  },
  {
    name: "08_dark_mode",
    description: "ダークモード",
    setup: async (page) => {
      // 建物配置
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

      // ダークモードに切替
      await page.select("#basemapSelect", "dark");
      await wait(2000);
    },
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("日影シミュレータ スクリーンショット撮影開始...\n");

  // 出力ディレクトリ作成
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (const scene of SCENES) {
    console.log(`撮影中: ${scene.name} - ${scene.description}`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
      await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 30000 });

      // 地図の読み込み待ち
      await wait(3000);

      // シーン固有のセットアップ
      await scene.setup(page);

      // スクリーンショット撮影
      const filename = `${scene.name}.png`;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, filename),
        fullPage: false,
      });

      console.log(`  -> ${filename} 保存完了`);
    } catch (err) {
      console.error(`  -> エラー: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log("\n撮影完了!");
  console.log(`出力先: ${path.resolve(OUTPUT_DIR)}`);
}

main().catch(console.error);
