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
