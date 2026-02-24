export type DimensionType = "yesno" | "scale";
export type DimensionDirection = "benefit" | "cost";

export interface Dimension {
  id: string;
  name: string;
  type: DimensionType;
  weight: number;
  order: number;
  tag: string;
  direction: DimensionDirection;
  archived: boolean;
}

export type FeedbackStatus = "new" | "reviewed" | "rejected";

export interface FeedbackItem {
  id: string;
  title: string;
  description: string | null;
  metadata: Record<string, string> | null;
  status: FeedbackStatus;
  opportunities: { id: string; title: string }[];
  productId: string | null;
  productName: string | null;
  sourceName: string | null;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  productId: string | null;
  productName: string | null;
  scores: Record<string, number>;
  explanation: Record<string, string>;
  reportSummary: string | null;
  horizon: "now" | "next" | "later" | null;
  quarter: string | null;
  status: "draft" | "under_review" | "approved" | "on_roadmap" | "rejected";
  feedbackCount: number;
  combinedScore: number;
  createdAt: string;
}
