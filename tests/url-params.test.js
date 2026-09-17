import { describe, test, expect } from "vitest";
import { encodeMapState, decodeMapState } from "../public/url-params-core.js";

describe("URL Parameters", () => {
  // =========================================================
  // encodeMapState
  // =========================================================
  test("encodeMapState encodes lat/lng/zoom/bearing/pitch", () => {
    const result = encodeMapState({
      lat: 35.681236,
      lng: 139.767125,
      zoom: 16.5,
      bearing: 45,
      pitch: 55,
      date: "2026-02-13",
      time: "12:00",
    });
    const params = new URLSearchParams(result);
    expect(params.get("lat")).toBe("35.681236");
    expect(params.get("lng")).toBe("139.767125");
    expect(params.get("z")).toBe("16.5");
    expect(params.get("b")).toBe("45");
    expect(params.get("p")).toBe("55");
    expect(params.get("d")).toBe("2026-02-13");
    expect(params.get("t")).toBe("12:00");
  });

  test("encodeMapState omits bearing=0 and pitch=0", () => {
    const result = encodeMapState({
      lat: 35.0,
      lng: 139.0,
      zoom: 16,
      bearing: 0,
      pitch: 0,
    });
    const params = new URLSearchParams(result);
    expect(params.has("b")).toBe(false);
    expect(params.has("p")).toBe(false);
  });

  test("encodeMapState omits null/undefined values", () => {
    const result = encodeMapState({
      lat: 35.0,
      lng: 139.0,
      zoom: 16,
    });
    const params = new URLSearchParams(result);
    expect(params.get("lat")).toBe("35.000000");
    expect(params.get("lng")).toBe("139.000000");
    expect(params.get("z")).toBe("16.0");
    expect(params.has("b")).toBe(false);
    expect(params.has("p")).toBe(false);
    expect(params.has("d")).toBe(false);
    expect(params.has("t")).toBe(false);
    expect(params.has("n")).toBe(false);
  });

  test("encodeMapState trims note and stores it as n", () => {
    const result = encodeMapState({
      lat: 35.0,
      lng: 139.0,
      zoom: 16,
      note: "  南側の影を確認  ",
    });
    const params = new URLSearchParams(result);
    expect(params.get("n")).toBe("南側の影を確認");
  });

  // =========================================================
  // decodeMapState
  // =========================================================
  test("decodeMapState decodes valid hash", () => {
    const hash = "lat=35.681236&lng=139.767125&z=16.5&b=45&p=55&d=2026-02-13&t=12:00";
    const result = decodeMapState(hash);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(35.681236, 5);
    expect(result.lng).toBeCloseTo(139.767125, 5);
    expect(result.zoom).toBeCloseTo(16.5, 1);
    expect(result.bearing).toBe(45);
    expect(result.pitch).toBe(55);
    expect(result.date).toBe("2026-02-13");
    expect(result.time).toBe("12:00");
  });

  test("decodeMapState returns null for empty hash", () => {
    expect(decodeMapState("")).toBeNull();
    expect(decodeMapState("#")).toBeNull();
  });

  test("decodeMapState returns null for invalid lat/lng", () => {
    // lat out of range
    expect(decodeMapState("lat=999&lng=139&z=16")).toBeNull();
    // lng out of range
    expect(decodeMapState("lat=35&lng=999&z=16")).toBeNull();
  });

  test("decodeMapState defaults bearing=0 and pitch=0 when omitted", () => {
    const result = decodeMapState("lat=35.0&lng=139.0&z=16");
    expect(result).not.toBeNull();
    expect(result.bearing).toBe(0);
    expect(result.pitch).toBe(0);
    expect(result.date).toBeNull();
    expect(result.time).toBeNull();
    expect(result.note).toBeNull();
  });

  test("decodeMapState validates zoom range (0-22)", () => {
    expect(decodeMapState("lat=35&lng=139&z=-1")).toBeNull();
    expect(decodeMapState("lat=35&lng=139&z=25")).toBeNull();
  });

  test("decodeMapState validates bearing range (-180 to 180)", () => {
    expect(decodeMapState("lat=35&lng=139&z=16&b=200")).toBeNull();
  });

  test("decodeMapState validates pitch range (0-85)", () => {
    expect(decodeMapState("lat=35&lng=139&z=16&p=90")).toBeNull();
  });

  // =========================================================
  // roundtrip
  // =========================================================
  test("roundtrip: encode → decode preserves values", () => {
    const original = {
      lat: 35.681236,
      lng: 139.767125,
      zoom: 16.5,
      bearing: 45,
      pitch: 55,
      date: "2026-02-13",
      time: "14:30",
    };
    const encoded = encodeMapState(original);
    const decoded = decodeMapState(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded.lat).toBeCloseTo(original.lat, 5);
    expect(decoded.lng).toBeCloseTo(original.lng, 5);
    expect(decoded.zoom).toBeCloseTo(original.zoom, 1);
    expect(decoded.bearing).toBe(original.bearing);
    expect(decoded.pitch).toBe(original.pitch);
    expect(decoded.date).toBe(original.date);
    expect(decoded.time).toBe(original.time);
  });

  test("decodeMapState strips leading # from hash", () => {
    const hash = "#lat=35.0&lng=139.0&z=16";
    const result = decodeMapState(hash);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(35.0, 1);
  });

  test("decodeMapState restores and truncates note", () => {
    const hash = `lat=35.0&lng=139.0&z=16&n=${encodeURIComponent(`  ${"a".repeat(130)}  `)}`;
    const result = decodeMapState(hash);
    expect(result).not.toBeNull();
    expect(result.note).toBe("a".repeat(120));
  });
});
