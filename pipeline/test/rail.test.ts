import { describe, it, expect } from "vitest";
import { classifyRail } from "../src/build/classify";

// N02属性: N02_001=鉄道区分コード, N02_002=事業者種別コード
describe("classifyRail", () => {
  it("JR新幹線は shinkansen", () => {
    expect(classifyRail("11", "1").mode).toBe("shinkansen");
  });
  it("JR在来線は jr", () => {
    expect(classifyRail("11", "2").mode).toBe("jr");
  });
  it("民営鉄道は rail", () => {
    expect(classifyRail("12", "4").mode).toBe("rail");
  });
  it("軌道(路面電車)は tram", () => {
    expect(classifyRail("21", "4").mode).toBe("tram");
  });
  it("鋼索鉄道(ケーブルカー)は cable", () => {
    expect(classifyRail("13", "4").mode).toBe("cable");
  });
  it("モノレール(懸垂式・跨座式)は monorail", () => {
    expect(classifyRail("14", "3").mode).toBe("monorail");
    expect(classifyRail("15", "4").mode).toBe("monorail");
    expect(classifyRail("22", "3").mode).toBe("monorail");
    expect(classifyRail("23", "3").mode).toBe("monorail");
  });
  it("未知コードは rail にフォールバック", () => {
    expect(classifyRail("99", "9").mode).toBe("rail");
  });
});
