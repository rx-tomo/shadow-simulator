import { describe, test, expect } from "vitest";
import { PlateauFallbackManager } from "../public/plateau-fallback.js";

const PRIMARY_URL = "pmtiles://https://tiles.shadow.datagen-pro.com/plateau-saitama-3cities.pmtiles";
const FALLBACK_URL = "pmtiles://https://shiworks.xsrv.jp/pmtiles-data/plateau/PLATEAU_2022_LOD1.pmtiles";

describe("PlateauFallbackManager", () => {
  test("初期状態はプライマリURL", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
    });
    expect(mgr.currentUrl).toBe(PRIMARY_URL);
    expect(mgr.isUsingFallback).toBe(false);
  });

  test("1回失敗ではフォールバックしない", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
    });
    const result = mgr.recordFailure();
    expect(result.shouldFallback).toBe(false);
    expect(mgr.currentUrl).toBe(PRIMARY_URL);
    expect(mgr.isUsingFallback).toBe(false);
  });

  test("3回連続失敗でフォールバック", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
      maxFailures: 3,
    });
    mgr.recordFailure();
    mgr.recordFailure();
    const result = mgr.recordFailure();
    expect(result.shouldFallback).toBe(true);
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
    expect(mgr.isUsingFallback).toBe(true);
  });

  test("タイムアウトで即時フォールバック", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
    });
    const result = mgr.recordTimeout();
    expect(result.shouldFallback).toBe(true);
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
    expect(mgr.isUsingFallback).toBe(true);
  });

  test("フォールバック後はURLが切り替わる", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
      maxFailures: 3,
    });
    // 3回失敗してフォールバック
    mgr.recordFailure();
    mgr.recordFailure();
    mgr.recordFailure();
    // URLが切り替わっていることを確認
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
    // さらに失敗してもURLはフォールバックのまま
    mgr.recordFailure();
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
  });

  test("フォールバック後は自動復帰しない（ページリロードのみ）", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
      maxFailures: 3,
    });
    // フォールバック発動
    mgr.recordFailure();
    mgr.recordFailure();
    mgr.recordFailure();
    expect(mgr.isUsingFallback).toBe(true);
    // 成功を記録してもプライマリに戻らない
    mgr.recordSuccess();
    expect(mgr.isUsingFallback).toBe(true);
    expect(mgr.currentUrl).toBe(FALLBACK_URL);
  });

  test("recordSuccess がプライマリ使用中に失敗カウントをリセットする (TD-01 branch)", () => {
    const mgr = new PlateauFallbackManager({
      primaryUrl: PRIMARY_URL,
      fallbackUrl: FALLBACK_URL,
      maxFailures: 3,
    });
    // 1回失敗（フォールバック未発動）
    mgr.recordFailure();
    expect(mgr.isUsingFallback).toBe(false);
    // 成功を記録 → isUsingFallback が false なので _failureCount がリセットされる
    mgr.recordSuccess();
    expect(mgr.isUsingFallback).toBe(false);
    expect(mgr.currentUrl).toBe(PRIMARY_URL);
    // リセット後、再度 maxFailures 回失敗しないとフォールバックしない
    mgr.recordFailure();
    mgr.recordFailure();
    expect(mgr.isUsingFallback).toBe(false);
    const result = mgr.recordFailure();
    expect(result.shouldFallback).toBe(true);
  });
});
