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
export type FeedbackProcessingStatus = "not_processed" | "processing" | "processed" | "failed";

export interface FeedbackInsights {
  chunks: string[];
  opportunities: Array<{ title: string; feedbackCount: number }>;
}

export interface FeedbackItem {
  id: string;
  title: string;
  description: string | null;
  metadata: Record<string, string> | null;
  status: FeedbackStatus;
  processingStatus: FeedbackProcessingStatus;
  feedbackInsights?: FeedbackInsights;
  ideas: string[];
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
  goalId: string | null;
  goalTitle: string | null;
  scores: Record<string, number>;
  explanation: Record<string, string>;
  reportSummary: string | null;
  horizon: "now" | "next" | "later" | null;
  quarter: string | null;
  status: "not_on_roadmap" | "on_roadmap" | "archived";
  confidence: number;
  feedbackCount: number;
  combinedScore: number;
  createdAt: string;
}
