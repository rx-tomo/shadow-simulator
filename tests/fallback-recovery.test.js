import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { PlateauFallbackManager } from "../public/plateau-fallback.js";

const PRIMARY_URL = "pmtiles://https://tiles.shadow.datagen-pro.com/plateau-japan-bldg-lod1.pmtiles";
const FALLBACK_URL = "pmtiles://https://shiworks.xsrv.jp/pmtiles-data/plateau/PLATEAU_2022_LOD1.pmtiles";
// Range GETリクエスト用URL (pmtiles://プレフィックスを除去)
const PRIMARY_HTTP_URL = "https://tiles.shadow.datagen-pro.com/plateau-japan-bldg-lod1.pmtiles";

function createFallbackManager(opts = {}) {
  return new PlateauFallbackManager({
    primaryUrl: PRIMARY_URL,
    fallbackUrl: FALLBACK_URL,
    maxFailures: 3,
    ...opts,
  });
}

function triggerFallback(mgr) {
  mgr.recordFailure();
  mgr.recordFailure();
  mgr.recordFailure();
}

// =========================================================
// 1. switchToPrimary — プライマリURLへの復帰
// =========================================================
describe("switchToPrimary", () => {
  test("switchToPrimary後にisUsingFallbackがfalseになる", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    expect(mgr.isUsingFallback).toBe(true);

    mgr.switchToPrimary();
    expect(mgr.isUsingFallback).toBe(false);
  });

  test("switchToPrimary後にcurrentUrlがプライマリURLに戻る", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    expect(mgr.currentUrl).toBe(FALLBACK_URL);

    mgr.switchToPrimary();
    expect(mgr.currentUrl).toBe(PRIMARY_URL);
  });

  test("switchToPrimary後に失敗カウンタがリセットされる", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    mgr.switchToPrimary();

    // 1回の失敗ではフォールバックしない（カウンタがリセットされている）
    const result = mgr.recordFailure();
    expect(result.shouldFallback).toBe(false);
    expect(mgr.isUsingFallback).toBe(false);
  });

  test("switchToPrimaryがstopRecoveryPollingを呼ぶ", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    // ポーリング開始してからswitchToPrimary
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });
    mgr.switchToPrimary();

    // isPrimaryAvailableは未確認なのでfalseのまま
    expect(mgr.isUsingFallback).toBe(false);
  });
});

// =========================================================
// 2. startRecoveryPolling — R2復旧検知ポーリング
// =========================================================
describe("startRecoveryPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("フォールバック状態でのみポーリングが開始される", () => {
    const mgr = createFallbackManager();
    const onRecovered = vi.fn();

    // フォールバック状態でないときはno-op
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    vi.advanceTimersByTime(5000);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("フォールバック中にRange GETでプライマリURLを確認する", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 30000, onRecovered });

    // 最初のインターバル後にfetchが呼ばれる
    await vi.advanceTimersByTimeAsync(30000);

    expect(global.fetch).toHaveBeenCalledWith(
      PRIMARY_HTTP_URL,
      expect.objectContaining({
        method: "GET",
        headers: { Range: "bytes=0-0" },
      })
    );
  });

  test("HTTP 200応答ではisPrimaryAvailableがfalseのまま", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    expect(mgr.isPrimaryAvailable).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mgr.isPrimaryAvailable).toBe(false);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  test("Rangeを無視したHTTP 200の応答bodyをcancelして接続を保持しない", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    const cancel = vi.fn().mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: { cancel } });

    mgr.startRecoveryPolling({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mgr.isPrimaryAvailable).toBe(false);
  });

  test("HTTP 206応答でもisPrimaryAvailableがtrueになる", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 206 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    await vi.advanceTimersByTimeAsync(1000);

    expect(mgr.isPrimaryAvailable).toBe(true);
  });

  test("HTTP 206の復旧検知時にonRecoveredコールバックが呼ばれる", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 206 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    await vi.advanceTimersByTimeAsync(1000);

    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  test("復旧検知後ポーリングが停止する（コールバック重複呼び出しなし）", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 206 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    await vi.advanceTimersByTimeAsync(1000);
    expect(onRecovered).toHaveBeenCalledTimes(1);

    // さらに時間を進めても再度呼ばれない
    await vi.advanceTimersByTimeAsync(5000);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  test("fetchエラー時はisPrimaryAvailableがfalseのまま", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    await vi.advanceTimersByTimeAsync(1000);

    expect(mgr.isPrimaryAvailable).toBe(false);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  test("デフォルトintervalMsは30000", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 206 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ onRecovered });

    // 29秒ではまだ呼ばれない
    await vi.advanceTimersByTimeAsync(29000);
    expect(global.fetch).not.toHaveBeenCalled();

    // 30秒で呼ばれる
    await vi.advanceTimersByTimeAsync(1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// =========================================================
// 3. stopRecoveryPolling — ポーリング停止
// =========================================================
describe("stopRecoveryPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("stopRecoveryPolling後にfetchが呼ばれない", async () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const onRecovered = vi.fn();
    mgr.startRecoveryPolling({ intervalMs: 1000, onRecovered });

    mgr.stopRecoveryPolling();

    await vi.advanceTimersByTimeAsync(5000);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("stopRecoveryPollingを複数回呼んでもエラーにならない", () => {
    const mgr = createFallbackManager();
    expect(() => {
      mgr.stopRecoveryPolling();
      mgr.stopRecoveryPolling();
    }).not.toThrow();
  });
});

// =========================================================
// 4. isPrimaryAvailable — 最新ヘルスチェック結果
// =========================================================
describe("isPrimaryAvailable", () => {
  test("初期値はfalse", () => {
    const mgr = createFallbackManager();
    expect(mgr.isPrimaryAvailable).toBe(false);
  });

  test("switchToPrimary後もisPrimaryAvailableはリセットされない", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    mgr.switchToPrimary();
    // switchToPrimaryは使用状態を変えるが、isPrimaryAvailableは
    // ヘルスチェック結果を反映するので独立
    expect(mgr.isPrimaryAvailable).toBe(false);
  });
});

// =========================================================
// 5. 既存API回帰 — recordFailure/recordTimeout/recordSuccessが壊れていない
// =========================================================
describe("既存API回帰", () => {
  test("switchToPrimary後に再度フォールバック可能", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    expect(mgr.isUsingFallback).toBe(true);

    mgr.switchToPrimary();
    expect(mgr.isUsingFallback).toBe(false);

    // 再度3回失敗でフォールバック
    triggerFallback(mgr);
    expect(mgr.isUsingFallback).toBe(true);
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
  });

  test("switchToPrimary後のタイムアウトで再フォールバック可能", () => {
    const mgr = createFallbackManager();
    triggerFallback(mgr);
    mgr.switchToPrimary();

    const result = mgr.recordTimeout();
    expect(result.shouldFallback).toBe(true);
    expect(mgr.isUsingFallback).toBe(true);
  });
});
