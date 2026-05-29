import type { AnalysisResult } from "../types";

export function renderJSON(result: AnalysisResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
