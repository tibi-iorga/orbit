export type DimensionType = "yesno" | "scale";

export interface Dimension {
  id: string;
  name: string;
  type: DimensionType;
  weight: number;
  order: number;
  tag: string;
}

export type FeedbackStatus = "new" | "reviewed" | "rejected";

export interface FeedbackItem {
  id: string;
  title: string;
  description: string | null;
  status: FeedbackStatus;
  opportunityId: string | null;
  opportunityTitle: string | null;
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
