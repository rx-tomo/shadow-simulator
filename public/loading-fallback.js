// public/loading-fallback.js
// App本体の初期化に失敗しても、読み込み表示が残り続けないようにする安全弁。

const LOADING_OVERLAY_MAX_MS = 8000;
let bootstrapTimeoutReported = false;

function hideLoadingOverlayFallback() {
  const overlay = document.getElementById("loadingOverlay");
  if (!bootstrapTimeoutReported && !overlay?.classList.contains("hidden")) {
    bootstrapTimeoutReported = true;
    // The app module might not have run yet, so telemetry must be optional.
    window.shadowAnalytics?.track?.('app_bootstrap_timeout', { stage: 'bootstrap' });
  }
  overlay?.classList.add("hidden");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(hideLoadingOverlayFallback, LOADING_OVERLAY_MAX_MS);
  }, { once: true });
} else {
  setTimeout(hideLoadingOverlayFallback, LOADING_OVERLAY_MAX_MS);
}
