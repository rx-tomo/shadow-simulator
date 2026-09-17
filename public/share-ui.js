// public/share-ui.js — URL共有関連

import { el } from './state.js';
import { updateUrlFromState } from './url-params.js';

export function restoreSharedInputs(urlParams) {
  if (!urlParams) return;

  if (urlParams.date) {
    const dateInput = el("dateInput");
    if (dateInput) dateInput.value = urlParams.date;
  }

  if (urlParams.time) {
    const timeInput = el("timeInput");
    if (timeInput) timeInput.value = urlParams.time;
    const [hh, mm] = urlParams.time.split(":").map(Number);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const timeRange = el("timeRange");
      if (timeRange) timeRange.value = String(hh * 60 + mm);
    }
  }

  const shareNoteInput = el("shareNoteInput");
  if (shareNoteInput) {
    shareNoteInput.value = urlParams.note || "";
  }
}

export function bindMapHashSync(map, onStateChange) {
  const dateInput = el("dateInput");
  const timeInput = el("timeInput");
  const timeRange = el("timeRange");
  const shareNoteInput = el("shareNoteInput");

  const handleStateChange = () => {
    updateUrlFromState(map);
    if (onStateChange) onStateChange();
  };

  if (dateInput) dateInput.addEventListener("change", handleStateChange);
  if (timeInput) timeInput.addEventListener("change", handleStateChange);
  if (timeRange) timeRange.addEventListener("input", handleStateChange);
  if (shareNoteInput) shareNoteInput.addEventListener("input", handleStateChange);
}

export function bindShareButton(map) {
  const shareBtn = el("shareButton");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async () => {
    updateUrlFromState(map);
    window.shadowAnalytics.track('share_click', {
      url_length: location.href.length,
    });
    try {
      await navigator.clipboard.writeText(location.href);
      shareBtn.textContent = "コピー済み";
      setTimeout(() => { shareBtn.textContent = "共有"; }, 2000);
    } catch (e) {
      console.warn('[share-ui] clipboard write failed:', e.message);
      shareBtn.textContent = "失敗";
      setTimeout(() => { shareBtn.textContent = "共有"; }, 2000);
    }
  });
}
