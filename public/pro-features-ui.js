// public/pro-features-ui.js — 比較レポートUI

import { state, el, getFootprints } from './state.js';
import {
  COMPARISON_BASELINE_STORAGE_KEY,
  buildComparisonReportCsv,
  buildComparisonReportFilename,
  buildComparisonReportMarkdown,
  buildComparisonReportText,
  compareSnapshots,
  createComparisonSnapshot,
  parseComparisonSnapshot,
  serializeComparisonSnapshot,
} from './compare-report.js?v=20260731-1';
import { updateUrlFromState } from './url-params.js';

let comparisonBaseline = loadComparisonBaseline();

function trackComparisonEvent(name, params = {}) {
  // Comparison snapshots contain labels, notes and coordinates. Send only the
  // explicit outcome and a URL without the query/hash used for shared state.
  try {
    window.shadowAnalytics?.track?.(name, {
      ...params,
      page_location: `${location.origin}${location.pathname}`,
    });
  } catch {
    // Analytics availability must not change a successful user operation.
  }
}

function downloadTextArtifact(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadComparisonBaseline() {
  try {
    return parseComparisonSnapshot(localStorage.getItem(COMPARISON_BASELINE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveComparisonBaseline(snapshot) {
  const nextBaseline = createComparisonSnapshot(snapshot);
  try {
    localStorage.setItem(COMPARISON_BASELINE_STORAGE_KEY, serializeComparisonSnapshot(nextBaseline));
    comparisonBaseline = nextBaseline;
    return true;
  } catch {
    console.warn('[pro-features-ui] failed to persist comparison baseline');
    return false;
  }
}

export function clearComparisonBaseline() {
  comparisonBaseline = null;
  try {
    localStorage.removeItem(COMPARISON_BASELINE_STORAGE_KEY);
  } catch (error) {
    console.warn('[pro-features-ui] failed to clear comparison baseline:', error?.message || error);
  }
}

export function createCurrentComparisonSnapshot(map, labelOverride = '') {
  const center = map?.getCenter?.();
  return createComparisonSnapshot({
    label: labelOverride || el('reportLabelInput')?.value || '現在状態',
    date: el('dateInput')?.value || '',
    time: el('timeInput')?.value || '',
    timezone: state.timezone,
    center: center ? { lat: center.lat, lng: center.lng } : undefined,
    zoom: map?.getZoom?.(),
    bearing: map?.getBearing?.(),
    pitch: map?.getPitch?.(),
    shareNote: el('shareNoteInput')?.value || '',
    shareUrl: location.href,
    userBuildingCount: getFootprints().length,
    plateauBuildingCount: state.plateauBuildingCount,
    plateauShadowCount: state.plateauShadowCount,
    basemapBuildingCount: state.basemapBuildingCount,
    basemapShadowCount: state.basemapShadowCount,
    plateauVisible: state.plateauVisible,
    basemapBuildingsVisible: state.basemapBuildingsVisible,
  });
}

function setReportLines(container, lines, emphasis = 'normal') {
  if (!container) return;
  container.replaceChildren();
  for (const text of lines) {
    const line = document.createElement('div');
    line.className = emphasis === 'strong' ? 'report-line report-diff-strong' : 'report-line';
    line.textContent = text;
    container.appendChild(line);
  }
}

export function renderComparisonReport(map) {
  const card = el('comparisonReportCard');
  const status = el('comparisonStatus');
  const updated = el('comparisonReportUpdated');
  const summary = el('comparisonReportSummary');
  const diffs = el('comparisonReportDiffs');

  if (!comparisonBaseline) {
    card?.classList.add('hidden');
    if (status) status.textContent = '比較元を1件保存すると、現在状態との差分レポートを作成できます。';
    return '';
  }

  const currentSnapshot = createCurrentComparisonSnapshot(map);
  const report = compareSnapshots(comparisonBaseline, currentSnapshot);
  const reportText = buildComparisonReportText(report);
  card?.classList.remove('hidden');

  if (updated) {
    updated.textContent = `更新: ${new Date().toLocaleString('ja-JP')}`;
  }
  setReportLines(summary, [
    `比較元: ${report.summary.baselineLabel} / ${report.summary.baselineDateTime}`,
    `比較元中心: ${report.summary.baselineCenter}`,
    `現在: ${report.summary.currentLabel} / ${report.summary.currentDateTime}`,
    `現在中心: ${report.summary.currentCenter}`,
  ]);
  setReportLines(
    diffs,
    report.changes.length > 0
      ? report.changes.map((change) => `${change.label}: ${change.baseline} → ${change.current}`)
      : ['主な差分はありません'],
    report.changes.length > 0 ? 'strong' : 'normal'
  );
  if (status) {
    status.textContent = report.changes.length > 0
      ? `${report.changes.length} 件の差分を検出しました。`
      : '比較元と現在状態の主な差分はありません。';
  }
  return reportText;
}

export function refreshProFeatures(map) {
  renderComparisonReport(map);
}

export function bindProFeatureControls(map) {
  const reportLabelInput = el('reportLabelInput');
  const saveComparisonButton = el('saveComparisonButton');
  const clearComparisonButton = el('clearComparisonButton');
  const copyComparisonReportButton = el('copyComparisonReportButton');
  const downloadComparisonCsvButton = el('downloadComparisonCsvButton');
  const downloadComparisonMarkdownButton = el('downloadComparisonMarkdownButton');
  const comparisonStatus = el('comparisonStatus');

  reportLabelInput?.addEventListener('input', () => refreshProFeatures(map));

  saveComparisonButton?.addEventListener('click', () => {
    updateUrlFromState(map);
    const baselineSnapshot = createCurrentComparisonSnapshot(
      map,
      reportLabelInput?.value || '比較元'
    );
    const saved = saveComparisonBaseline(baselineSnapshot);
    refreshProFeatures(map);
    if (comparisonStatus) {
      comparisonStatus.textContent = saved
        ? '比較元を保存しました。'
        : '比較元を保存できませんでした。ブラウザの保存設定や空き容量を確認してください。';
    }
    if (saved) trackComparisonEvent('comparison_baseline_save');
  });

  clearComparisonButton?.addEventListener('click', () => {
    clearComparisonBaseline();
    if (comparisonStatus) comparisonStatus.textContent = '比較元をクリアしました。';
    refreshProFeatures(map);
  });

  copyComparisonReportButton?.addEventListener('click', async () => {
    if (!comparisonBaseline) {
      if (comparisonStatus) comparisonStatus.textContent = '比較元を先に保存してください。';
      return;
    }
    updateUrlFromState(map);
    const reportText = renderComparisonReport(map);
    try {
      await navigator.clipboard.writeText(reportText);
      if (comparisonStatus) comparisonStatus.textContent = '比較レポートをコピーしました。';
      trackComparisonEvent('comparison_report_copy');
    } catch {
      console.warn('[pro-features-ui] comparison report copy failed');
      if (comparisonStatus) comparisonStatus.textContent = '比較レポートのコピーに失敗しました。';
    }
  });

  const downloadComparison = (format) => {
    if (!comparisonBaseline) {
      if (comparisonStatus) comparisonStatus.textContent = '比較元を先に保存してください。';
      return;
    }

    updateUrlFromState(map);
    const report = compareSnapshots(comparisonBaseline, createCurrentComparisonSnapshot(map));
    renderComparisonReport(map);
    const isCsv = format === 'csv';
    const content = isCsv
      ? buildComparisonReportCsv(report)
      : buildComparisonReportMarkdown(report);
    const filename = buildComparisonReportFilename(report, isCsv ? 'csv' : 'md');
    downloadTextArtifact(
      content,
      filename,
      isCsv ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'
    );
    if (comparisonStatus) {
      comparisonStatus.textContent = isCsv
        ? '比較レポートをCSVで保存しました。'
        : '比較レポートをMarkdownで保存しました。';
    }
    trackComparisonEvent('comparison_report_export', {
      format: isCsv ? 'csv' : 'markdown',
    });
  };

  downloadComparisonCsvButton?.addEventListener('click', () => downloadComparison('csv'));
  downloadComparisonMarkdownButton?.addEventListener('click', () => downloadComparison('markdown'));
}
