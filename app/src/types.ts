export type DimensionType = "yesno" | "scale";

export interface Dimension {
  id: string;
  name: string;
  type: DimensionType;
  weight: number;
  order: number;
}

export interface FeatureRow {
  id: string;
  title: string;
  description: string | null;
  clusterId: string | null;
  clusterName: string | null;
  productId: string | null;
  productName: string | null;
  scores: Record<string, number>;
  explanation: Record<string, string>;
  combinedScore: number;
}

export interface ClusterRow {
  id: string;
  name: string;
  featureCount: number;
  reportSummary: string | null;
}
