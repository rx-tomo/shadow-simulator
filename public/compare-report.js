export const COMPARISON_BASELINE_STORAGE_KEY =
  "shadow-simulator:comparison-baseline:v1";

const MAX_LABEL_LENGTH = 40;
const MAX_NOTE_LENGTH = 120;
const MAX_URL_LENGTH = 2000;

function normalizeSingleLine(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeNumber(value, digits) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(digits));
}

function normalizeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function normalizeCenter(center) {
  if (!center || typeof center !== "object") {
    return { lat: null, lng: null };
  }

  return {
    lat: normalizeNumber(center.lat, 6),
    lng: normalizeNumber(center.lng, 6),
  };
}

function formatCoordinatePair(center) {
  if (center.lat == null || center.lng == null) return "—";
  return `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
}

function formatDateTime(date, time) {
  const normalizedDate = normalizeSingleLine(date, 32);
  const normalizedTime = normalizeSingleLine(time, 16);
  if (normalizedDate && normalizedTime) return `${normalizedDate} ${normalizedTime}`;
  return normalizedDate || normalizedTime || "—";
}

function formatCount(value) {
  return String(normalizeCount(value));
}

function createChange(label, baseline, current) {
  return {
    label,
    baseline,
    current,
  };
}

function resolveComparisonReport(reportInput) {
  return reportInput?.summary
    ? reportInput
    : compareSnapshots(reportInput?.baseline, reportInput?.current);
}

function escapeCsvFormula(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const escaped = escapeCsvFormula(value).replace(/"/g, '""');
  return `"${escaped}"`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function comparisonRows(report) {
  return [
    ["概要", "ラベル", report.summary.baselineLabel, report.summary.currentLabel],
    ["概要", "日時", report.summary.baselineDateTime, report.summary.currentDateTime],
    ["概要", "中心座標", report.summary.baselineCenter, report.summary.currentCenter],
    ["概要", "共有メモ", report.baseline.shareNote || "—", report.current.shareNote || "—"],
    ["概要", "共有URL", report.summary.baselineUrl || "—", report.summary.currentUrl || "—"],
  ];
}

function safeFilenamePart(value, fallback) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

export function createComparisonSnapshot(input = {}) {
  return {
    label: normalizeSingleLine(input.label, MAX_LABEL_LENGTH),
    date: normalizeSingleLine(input.date, 32),
    time: normalizeSingleLine(input.time, 16),
    center: normalizeCenter(input.center),
    zoom: normalizeNumber(input.zoom, 1),
    shareNote: normalizeSingleLine(input.shareNote, MAX_NOTE_LENGTH),
    shareUrl: normalizeSingleLine(input.shareUrl, MAX_URL_LENGTH),
    userBuildingCount: normalizeCount(input.userBuildingCount),
    plateauBuildingCount: normalizeCount(input.plateauBuildingCount),
    plateauShadowCount: normalizeCount(input.plateauShadowCount),
    basemapBuildingCount: normalizeCount(input.basemapBuildingCount),
    basemapShadowCount: normalizeCount(input.basemapShadowCount),
    plateauVisible: Boolean(input.plateauVisible),
    basemapBuildingsVisible: Boolean(input.basemapBuildingsVisible),
  };
}

export function serializeComparisonSnapshot(input = {}) {
  return JSON.stringify(createComparisonSnapshot(input));
}

export function parseComparisonSnapshot(serialized) {
  if (typeof serialized !== "string" || !serialized.trim()) return null;

  try {
    const parsed = JSON.parse(serialized);
    return createComparisonSnapshot(parsed);
  } catch {
    return null;
  }
}

export function compareSnapshots(baselineInput, currentInput) {
  const baseline = createComparisonSnapshot(baselineInput);
  const current = createComparisonSnapshot(currentInput);
  const changes = [];

  const baselineDateTime = formatDateTime(baseline.date, baseline.time);
  const currentDateTime = formatDateTime(current.date, current.time);
  if (baselineDateTime !== currentDateTime) {
    changes.push(createChange("日時", baselineDateTime, currentDateTime));
  }

  const baselineCenter = formatCoordinatePair(baseline.center);
  const currentCenter = formatCoordinatePair(current.center);
  if (baselineCenter !== currentCenter) {
    changes.push(createChange("中心座標", baselineCenter, currentCenter));
  }

  if (baseline.zoom !== current.zoom) {
    changes.push(
      createChange(
        "ズーム",
        baseline.zoom == null ? "—" : baseline.zoom.toFixed(1),
        current.zoom == null ? "—" : current.zoom.toFixed(1)
      )
    );
  }

  if ((baseline.shareNote || "—") !== (current.shareNote || "—")) {
    changes.push(
      createChange("共有メモ", baseline.shareNote || "—", current.shareNote || "—")
    );
  }

  if (baseline.userBuildingCount !== current.userBuildingCount) {
    changes.push(
      createChange(
        "ユーザー建物数",
        formatCount(baseline.userBuildingCount),
        formatCount(current.userBuildingCount)
      )
    );
  }

  if (baseline.plateauShadowCount !== current.plateauShadowCount) {
    changes.push(
      createChange(
        "PLATEAU影件数",
        formatCount(baseline.plateauShadowCount),
        formatCount(current.plateauShadowCount)
      )
    );
  }

  if (baseline.basemapShadowCount !== current.basemapShadowCount) {
    changes.push(
      createChange(
        "ベースマップ影件数",
        formatCount(baseline.basemapShadowCount),
        formatCount(current.basemapShadowCount)
      )
    );
  }

  return {
    baseline,
    current,
    summary: {
      baselineLabel: baseline.label || "比較元",
      currentLabel: current.label || "現在",
      baselineDateTime,
      currentDateTime,
      baselineCenter,
      currentCenter,
      baselineUrl: baseline.shareUrl,
      currentUrl: current.shareUrl,
      changedFieldCount: changes.length,
    },
    changes,
  };
}

export function buildComparisonReportText(reportInput) {
  const report = resolveComparisonReport(reportInput);

  const lines = [
    "日影シミュレータ 比較レポート",
    "",
    `[比較元] ${report.summary.baselineLabel}`,
    `日時: ${report.summary.baselineDateTime}`,
    `中心座標: ${report.summary.baselineCenter}`,
  ];

  if (report.summary.baselineUrl) {
    lines.push(`比較元URL: ${report.summary.baselineUrl}`);
  }

  lines.push(
    "",
    `[現在] ${report.summary.currentLabel}`,
    `日時: ${report.summary.currentDateTime}`,
    `中心座標: ${report.summary.currentCenter}`
  );

  if (report.summary.currentUrl) {
    lines.push(`現在URL: ${report.summary.currentUrl}`);
  }

  lines.push("", "[差分]");

  if (report.changes.length === 0) {
    lines.push("差分なし");
  } else {
    for (const change of report.changes) {
      lines.push(`- ${change.label}: ${change.baseline} → ${change.current}`);
    }
  }

  return lines.join("\n");
}

export function buildComparisonReportCsv(reportInput) {
  const report = resolveComparisonReport(reportInput);
  const rows = [
    ["区分", "項目", "比較元", "現在"],
    ...comparisonRows(report),
    ...(report.changes.length > 0
      ? report.changes.map((change) => [
        "差分",
        change.label,
        change.baseline,
        change.current,
      ])
      : [["差分", "判定", "差分なし", "差分なし"]]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function buildComparisonReportMarkdown(reportInput) {
  const report = resolveComparisonReport(reportInput);
  const lines = [
    "# 日影シミュレータ 比較レポート",
    "",
    "## 比較条件",
    "",
    "| 項目 | 比較元 | 現在 |",
    "| --- | --- | --- |",
    ...comparisonRows(report).map(([, label, baseline, current]) =>
      `| ${markdownCell(label)} | ${markdownCell(baseline)} | ${markdownCell(current)} |`
    ),
    "",
    "## 差分",
    "",
    "| 項目 | 比較元 | 現在 |",
    "| --- | --- | --- |",
  ];

  if (report.changes.length === 0) {
    lines.push("| 判定 | 差分なし | 差分なし |");
  } else {
    lines.push(...report.changes.map((change) =>
      `| ${markdownCell(change.label)} | ${markdownCell(change.baseline)} | ${markdownCell(change.current)} |`
    ));
  }

  lines.push(
    "",
    "> この出力は概算比較用です。正式な日影図、法規判定、発電量保証には使用できません。",
    ""
  );
  return lines.join("\n");
}

export function buildComparisonReportFilename(reportInput, extension) {
  const report = resolveComparisonReport(reportInput);
  const date = safeFilenamePart(report.current.date?.replace(/-/g, ""), "undated");
  const time = safeFilenamePart(report.current.time?.replace(/:/g, ""), "time");
  const baselineLabel = safeFilenamePart(report.summary.baselineLabel, "baseline");
  const currentLabel = safeFilenamePart(report.summary.currentLabel, "current");
  const safeExtension = extension === "md" ? "md" : "csv";
  return `shadow-compare-${date}-${time}-${baselineLabel}-vs-${currentLabel}.${safeExtension}`;
}
