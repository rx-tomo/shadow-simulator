import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state, getFootprints } from '../public/state.js';

// =========================================================
// T-008: getFootprints 型バリデーション テスト
// =========================================================

describe('getFootprints 型バリデーション', () => {
  let originalTerraInstance;

  beforeEach(() => {
    originalTerraInstance = state.terraInstance;
  });

  afterEach(() => {
    state.terraInstance = originalTerraInstance;
  });

  // --- AC-20-1: null/undefined チェック ---

  it('terraInstance === null のとき空配列を返す', () => {
    state.terraInstance = null;
    expect(getFootprints()).toEqual([]);
  });

  it('terraInstance === undefined のとき空配列を返す', () => {
    state.terraInstance = undefined;
    expect(getFootprints()).toEqual([]);
  });

  it('getSnapshot() === null のとき空配列を返す', () => {
    state.terraInstance = { getSnapshot: () => null };
    expect(getFootprints()).toEqual([]);
  });

  it('getSnapshot() === undefined のとき空配列を返す', () => {
    state.terraInstance = { getSnapshot: () => undefined };
    expect(getFootprints()).toEqual([]);
  });

  // --- AC-20-1: 非配列・非オブジェクト時にconsole.warnを出力 ---

  it('getSnapshot() が数値を返すとき空配列を返し console.warn を出力する', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.terraInstance = { getSnapshot: () => 42 };
    const result = getFootprints();
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('getFootprints'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });

  it('getSnapshot() が文字列を返すとき空配列を返し console.warn を出力する', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.terraInstance = { getSnapshot: () => "invalid" };
    const result = getFootprints();
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('getFootprints'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });

  // --- AC-20-1: 正常系 ---

  it('getSnapshot() が { features: [...] } のとき features 配列を返す', () => {
    const features = [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { height: 10 } },
    ];
    state.terraInstance = { getSnapshot: () => ({ features }) };
    expect(getFootprints()).toEqual(features);
  });

  it('getSnapshot() が配列を返すとき そのまま配列を返す', () => {
    const features = [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { height: 5 } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] }, properties: { height: 8 } },
    ];
    state.terraInstance = { getSnapshot: () => features };
    expect(getFootprints()).toEqual(features);
  });

  // --- AC-20-1: エッジケース ---

  it('getSnapshot() が空オブジェクト {} のとき空配列を返す', () => {
    state.terraInstance = { getSnapshot: () => ({}) };
    expect(getFootprints()).toEqual([]);
  });

  it('getSnapshot() が boolean を返すとき空配列を返し console.warn を出力する', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.terraInstance = { getSnapshot: () => true };
    const result = getFootprints();
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('getFootprints'),
      expect.any(String)
    );
    warnSpy.mockRestore();
  });

  it('terraInstance が null でないが getSnapshot メソッドがないとき空配列を返す', () => {
    state.terraInstance = { someOtherMethod: () => {} };
    expect(getFootprints()).toEqual([]);
  });
});
