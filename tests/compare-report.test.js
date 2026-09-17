import { describe, expect, test } from "vitest";
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
} from "../public/compare-report.js";

describe("compare-report", () => {
  test("createComparisonSnapshot normalizes values", () => {
    const snapshot = createComparisonSnapshot({
      label: "  冬至   15:00 ",
      date: "2026-12-22",
      time: "15:00",
      center: { lat: 35.6812365, lng: 139.7671249 },
      zoom: 16.34,
      shareNote: "  南側の影を確認  ",
      shareUrl: ` https://example.com/#${"a".repeat(2500)} `,
      userBuildingCount: "2",
      plateauVisible: 1,
      basemapBuildingsVisible: 0,
    });

    expect(snapshot.label).toBe("冬至 15:00");
    expect(snapshot.center.lat).toBe(35.681236);
    expect(snapshot.center.lng).toBe(139.767125);
    expect(snapshot.zoom).toBe(16.3);
    expect(snapshot.shareNote).toBe("南側の影を確認");
    expect(snapshot.shareUrl.length).toBe(2000);
    expect(snapshot.userBuildingCount).toBe(2);
    expect(snapshot.plateauVisible).toBe(true);
    expect(snapshot.basemapBuildingsVisible).toBe(false);
  });

  test("serializeComparisonSnapshot and parseComparisonSnapshot roundtrip", () => {
    const serialized = serializeComparisonSnapshot({
      label: "比較元",
      date: "2026-12-22",
      time: "09:00",
    });
    const parsed = parseComparisonSnapshot(serialized);

    expect(parsed.label).toBe("比較元");
    expect(parsed.date).toBe("2026-12-22");
    expect(parsed.time).toBe("09:00");
    expect(parseComparisonSnapshot("not-json")).toBeNull();
    expect(COMPARISON_BASELINE_STORAGE_KEY).toContain("comparison-baseline");
  });

  test("compareSnapshots lists major differences", () => {
    const report = compareSnapshots(
      {
        label: "冬至 9:00",
        date: "2026-12-22",
        time: "09:00",
        center: { lat: 35.6812, lng: 139.7671 },
        shareNote: "午前の日照",
        plateauShadowCount: 12,
        basemapShadowCount: 8,
      },
      {
        label: "冬至 15:00",
        date: "2026-12-22",
        time: "15:00",
        center: { lat: 35.6801, lng: 139.7682 },
        shareNote: "午後の日照",
        plateauShadowCount: 22,
        basemapShadowCount: 17,
      }
    );

    expect(report.summary.baselineLabel).toBe("冬至 9:00");
    expect(report.changes.some((item) => item.label === "日時")).toBe(true);
    expect(report.changes.some((item) => item.label === "中心座標")).toBe(true);
    expect(report.changes.some((item) => item.label === "PLATEAU影件数")).toBe(true);
  });

  test("buildComparisonReportText renders labels and urls", () => {
    const text = buildComparisonReportText(compareSnapshots(
      {
        label: "比較元",
        date: "2026-12-22",
        time: "09:00",
        center: { lat: 35.6812, lng: 139.7671 },
        shareUrl: "https://example.com/#base",
      },
      {
        label: "現在",
        date: "2026-12-22",
        time: "15:00",
        center: { lat: 35.6801, lng: 139.7682 },
        shareUrl: "https://example.com/#current",
      }
    ));

    expect(text).toContain("日影シミュレータ 比較レポート");
    expect(text).toContain("[比較元] 比較元");
    expect(text).toContain("[現在] 現在");
    expect(text).toContain("[差分]");
    expect(text).toContain("比較元URL: https://example.com/#base");
    expect(text).toContain("現在URL: https://example.com/#current");
  });

  test("buildComparisonReportCsv creates an Excel-compatible escaped table", () => {
    const csv = buildComparisonReportCsv(compareSnapshots(
      {
        label: '=HYPERLINK("https://example.com","案A")',
        date: "2026-12-22",
        time: "09:00",
        center: { lat: 35.6812, lng: 139.7671 },
        shareNote: '北側, "通路"',
      },
      {
        label: "案B",
        date: "2026-12-22",
        time: "15:00",
        center: { lat: 35.6801, lng: 139.7682 },
        shareNote: "南側通路",
      }
    ));

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"区分","項目","比較元","現在"');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"",""案A"")"`);
    expect(csv).toContain('"差分","日時","2026-12-22 09:00","2026-12-22 15:00"');
    expect(csv).toContain('"北側, ""通路"""');
  });

  test("buildComparisonReportMarkdown renders summary and differences as tables", () => {
    const markdown = buildComparisonReportMarkdown(compareSnapshots(
      {
        label: "案A",
        date: "2026-12-22",
        time: "09:00",
        shareNote: "中庭 | 東側",
      },
      {
        label: "案B",
        date: "2026-12-22",
        time: "15:00",
        shareNote: "中庭を拡張",
      }
    ));

    expect(markdown).toContain("# 日影シミュレータ 比較レポート");
    expect(markdown).toContain("| 項目 | 比較元 | 現在 |");
    expect(markdown).toContain("| ラベル | 案A | 案B |");
    expect(markdown).toContain("中庭 \\| 東側");
    expect(markdown).toContain("## 差分");
  });

  test("buildComparisonReportFilename includes scenario date, time, and labels", () => {
    const report = compareSnapshots(
      {
        label: "計画案 A/東棟",
        date: "2026-12-22",
        time: "09:00",
      },
      {
        label: "計画案 B 西棟",
        date: "2026-12-22",
        time: "15:00",
      }
    );

    expect(buildComparisonReportFilename(report, "csv"))
      .toBe("shadow-compare-20261222-1500-計画案-A-東棟-vs-計画案-B-西棟.csv");
    expect(buildComparisonReportFilename(report, "md"))
      .toBe("shadow-compare-20261222-1500-計画案-A-東棟-vs-計画案-B-西棟.md");
  });
});
