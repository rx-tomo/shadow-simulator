/**
 * PlateauFallbackManager — PLATEAU PMTilesソースのフォールバック管理
 *
 * R2配信のPMTilesが障害時にshi-works配信へ自動切替する。
 * - HTTP 3回連続失敗 → フォールバック
 * - 5秒タイムアウト → 即時フォールバック
 * - フォールバック後はヘルスチェックでR2復旧を検知し、ユーザー確認後にプライマリへ復帰
 *
 * @module plateau-fallback
 */

export class PlateauFallbackManager {
  /**
   * @param {Object} options
   * @param {string} options.primaryUrl - R2配信のPMTiles URL
   * @param {string} options.fallbackUrl - shi-works配信のPMTiles URL
   * @param {number} [options.maxFailures=3] - フォールバック発動までの連続失敗回数
   * @param {number} [options.timeoutMs=5000] - タイムアウト閾値（ミリ秒）
   */
  constructor({ primaryUrl, fallbackUrl, maxFailures = 3, timeoutMs = 5000 }) {
    this._primaryUrl = primaryUrl;
    this._fallbackUrl = fallbackUrl;
    this._maxFailures = maxFailures;
    this._timeoutMs = timeoutMs;
    this._failureCount = 0;
    this._isUsingFallback = false;
    this._isPrimaryAvailable = false;
    this._pollingTimerId = null;
  }

  /**
   * HTTP失敗を記録する
   * @returns {{ shouldFallback: boolean }}
   */
  recordFailure() {
    if (this._isUsingFallback) return { shouldFallback: false };
    this._failureCount++;
    if (this._failureCount >= this._maxFailures) {
      this._isUsingFallback = true;
      console.warn(`[PlateauFallback] Switching to fallback URL after ${this._failureCount} failures`);
      return { shouldFallback: true };
    }
    return { shouldFallback: false };
  }

  /**
   * タイムアウトを記録する（即時フォールバック）
   * @returns {{ shouldFallback: boolean }}
   */
  recordTimeout() {
    if (this._isUsingFallback) return { shouldFallback: false };
    this._isUsingFallback = true;
    console.warn('[PlateauFallback] Switching to fallback URL due to timeout');
    return { shouldFallback: true };
  }

  /**
   * 成功を記録する（失敗カウンタをリセット）
   */
  recordSuccess() {
    if (!this._isUsingFallback) {
      this._failureCount = 0;
    }
  }

  /**
   * 現在使用すべきURL
   * @returns {string}
   */
  get currentUrl() {
    return this._isUsingFallback ? this._fallbackUrl : this._primaryUrl;
  }

  /** Primary URL used for an explicit, user-approved restoration attempt. */
  get primaryUrl() {
    return this._primaryUrl;
  }

  /** Maximum time to wait before treating an unconstructed source as stalled. */
  get timeoutMs() {
    return this._timeoutMs;
  }

  /**
   * フォールバック中かどうか
   * @returns {boolean}
   */
  get isUsingFallback() {
    return this._isUsingFallback;
  }

  /**
   * 最新のヘルスチェック結果
   * @returns {boolean}
   */
  get isPrimaryAvailable() {
    return this._isPrimaryAvailable;
  }

  /**
   * R2復旧検知ポーリングを開始する。
   * フォールバック状態でのみ有効。非フォールバック時はno-op。
   * 最小Range GETでprimaryUrlを確認し、HTTP 206だけを復旧と判定。
   * 復旧検知後はポーリングを自動停止する。
   *
   * @param {Object} [options]
   * @param {number} [options.intervalMs=30000] - ポーリング間隔（ミリ秒）
   * @param {() => void} [options.onRecovered] - 復旧検知時のコールバック
   */
  startRecoveryPolling({ intervalMs = 30000, onRecovered } = {}) {
    if (!this._isUsingFallback) return;
    this.stopRecoveryPolling();

    const httpUrl = this._primaryUrl.replace("pmtiles://", "");

    this._pollingTimerId = setInterval(async () => {
      try {
        const res = await fetch(httpUrl, {
          method: "GET",
          mode: "cors",
          headers: { Range: "bytes=0-0" },
        });
        try {
          if (res.status === 206) {
            this._isPrimaryAvailable = true;
            this.stopRecoveryPolling();
            if (onRecovered) onRecovered();
          }
        } finally {
          // A server that ignores Range can return the full PMTiles file.
          // Release its response stream even when it is not a valid recovery.
          await res.body?.cancel?.();
        }
      } catch (_) {
        // ネットワークエラー — まだ復旧していない
      }
    }, intervalMs);
  }

  /**
   * R2復旧検知ポーリングを停止する
   */
  stopRecoveryPolling() {
    if (this._pollingTimerId !== null) {
      clearInterval(this._pollingTimerId);
      this._pollingTimerId = null;
    }
  }

  /**
   * プライマリURLに復帰する。
   * isUsingFallback=false, failureCount=0にリセットし、ポーリングを停止する。
   */
  switchToPrimary() {
    this._isUsingFallback = false;
    this._failureCount = 0;
    this.stopRecoveryPolling();
  }
}
