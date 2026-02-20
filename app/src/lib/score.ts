export type DimensionType = "yesno" | "scale";
export type DimensionDirection = "benefit" | "cost";

export interface DimensionConfig {
  id: string;
  name: string;
  type: DimensionType;
  weight: number;
  order: number;
  tag: string;
  direction: DimensionDirection;
}

export function parseScores(json: string | null): Record<string, number> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    return typeof o === "object" && o !== null ? o : {};
  } catch {
    return {};
  }
}

export function serializeScores(scores: Record<string, number>): string {
  return JSON.stringify(scores);
}

export function computeCombinedScore(
  scores: Record<string, number>,
  dimensions: DimensionConfig[]
): number {
  let total = 0;
  for (const d of dimensions) {
    const v = scores[d.id];
    if (v === undefined) continue;
    const cap = d.type === "yesno" ? 1 : 3;
    // For cost dimensions, invert: a score of 3 becomes 1, 1 becomes 3
    const effective = d.direction === "cost" ? cap - v + 1 : v;
    total += effective * d.weight;
  }
  return Math.round(total * 10) / 10;
}

export function getMaxPossibleScore(dimensions: DimensionConfig[]): number {
  let max = 0;
  for (const d of dimensions) {
    const cap = d.type === "yesno" ? 1 : 3;
    max += cap * d.weight;
  }
  return max;
}
