// 国土数値情報 N02 のコード定義に基づく分類
// N02_001 鉄道区分: 11=普通鉄道JR 12=普通鉄道 13=鋼索鉄道 14=懸垂式鉄道 15=跨座式鉄道
//   16=案内軌条式鉄道 17=無軌条電車 21=軌道 22=懸垂式モノレール 23=跨座式モノレール
//   24=案内軌条式(軌道) 25=浮上式鉄道
// N02_002 事業者種別: 1=JR新幹線 2=JR在来線 3=公営鉄道 4=民営鉄道 5=第三セクター

export type RailMode = "shinkansen" | "jr" | "rail" | "tram" | "monorail" | "cable";

export interface RailClass {
  mode: RailMode;
}

export function classifyRail(railwayClass: string, institutionType: string): RailClass {
  if (institutionType === "1") return { mode: "shinkansen" };
  switch (railwayClass) {
    case "13":
      return { mode: "cable" };
    case "14":
    case "15":
    case "16":
    case "22":
    case "23":
    case "24":
    case "25":
      return { mode: "monorail" };
    case "17":
    case "21":
      return { mode: "tram" };
    case "11":
      return { mode: institutionType === "2" ? "jr" : "rail" };
    default:
      return { mode: "rail" };
  }
}
