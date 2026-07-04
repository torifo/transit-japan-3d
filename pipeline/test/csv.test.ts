import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/build/csv";

describe("parseCsv", () => {
  it("ヘッダをキーにした行オブジェクトを返す", () => {
    const rows = parseCsv("a,b\n1,2\n3,4\n");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });
  it("ダブルクォート内のカンマ・改行・エスケープを扱う", () => {
    const rows = parseCsv('name,desc\n"駅前, 南口","he said ""hi""\n2nd line"\n');
    expect(rows).toEqual([{ name: "駅前, 南口", desc: 'he said "hi"\n2nd line' }]);
  });
  it("BOMとCRLFを吸収する", () => {
    const rows = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });
  it("空行を無視する", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([{ a: "1", b: "2" }]);
  });
});
