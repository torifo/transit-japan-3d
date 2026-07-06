import { describe, it, expect } from "vitest";
import { gtfsTimeToSec } from "../src/build/timetable-util";

describe("gtfsTimeToSec", () => {
  it("HH:MM:SS を秒に変換する", () => {
    expect(gtfsTimeToSec("08:30:00")).toBe(8 * 3600 + 30 * 60);
  });
  it("24時超え(深夜便)を扱う", () => {
    expect(gtfsTimeToSec("25:15:30")).toBe(25 * 3600 + 15 * 60 + 30);
  });
  it("H:MM:SS (ゼロ埋めなし)を扱う", () => {
    expect(gtfsTimeToSec("7:05:00")).toBe(7 * 3600 + 5 * 60);
  });
  it("空文字・不正はnull", () => {
    expect(gtfsTimeToSec("")).toBeNull();
    expect(gtfsTimeToSec("abc")).toBeNull();
    expect(gtfsTimeToSec("12:00")).toBeNull();
  });
});

import { densifyAlongShape, type SeqPoint } from "../src/build/timetable-util";

describe("densifyAlongShape", () => {
  // L字型の形状: (0,35)→(0.1,35)→(0.1,35.1)。停留所は両端
  const shape: [number, number][] = [
    [0, 35],
    [0.05, 35],
    [0.1, 35],
    [0.1, 35.05],
    [0.1, 35.1],
  ];
  const stops: SeqPoint[] = [
    [0, 0, 35],
    [1000, 0.1, 35.1],
  ];

  it("形状の中間頂点を距離按分した時刻付きで挿入する", () => {
    const out = densifyAlongShape(stops, shape);
    expect(out.length).toBeGreaterThan(2);
    // 時刻は単調非減少
    for (let i = 1; i < out.length; i++) expect(out[i][0]).toBeGreaterThanOrEqual(out[i - 1][0]);
    // 曲がり角(0.1,35)が含まれ、時刻はおおよそ距離比(半分弱)になる
    const corner = out.find(([, lon, lat]) => lon === 0.1 && lat === 35);
    expect(corner).toBeDefined();
    expect(corner![0]).toBeGreaterThan(300);
    expect(corner![0]).toBeLessThan(700);
  });

  it("形状から離れた停留所列はそのまま返す(不一致検出)", () => {
    const far: SeqPoint[] = [
      [0, 1, 36],
      [1000, 1.1, 36.1],
    ];
    expect(densifyAlongShape(far, shape)).toEqual(far);
  });

  it("2点未満・形状なしはそのまま返す", () => {
    expect(densifyAlongShape([[0, 0, 35]], shape)).toEqual([[0, 0, 35]]);
    expect(densifyAlongShape(stops, [])).toEqual(stops);
  });
});
