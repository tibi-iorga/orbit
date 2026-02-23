/**
 * In-memory cache for dimensions, products, and the opportunities list.
 * Dimensions/products change rarely; list is cached so closing the detail modal
 * doesn't trigger a full reload. Client-side only.
 */

const TTL_MS = 5 * 60 * 1000; // Opportunities list cache
const FEEDBACK_LIST_TTL_MS = 2 * 60 * 1000; // Feedback list: 2 minutes
const STATIC_DATA_TTL_MS = 60 * 60 * 1000; // Products and dimensions: 1 hour (they change very rarely)

import type { Opportunity, Dimension } from "@/types";
type ProductFlat = { id: string; name: string; parentId?: string | null; feedbackCount?: number }[];
type ProductsResponse = { flat: ProductFlat; tree: Record<string, unknown>[] };

export type FeedbackListResponse = {
  feedbackItems: unknown[];
  opportunities: { id: string; title: string; feedbackCount?: number }[];
  products: { id: string; name: string; feedbackCount: number; parentId?: string | null }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  totalUnassigned?: number;
  newCount?: number;
};

const FEEDBACK_LIST_MAX_ENTRIES = 30; // One entry per tab × page × product filter combo

let dimensionsCache: { data: Dimension[]; ts: number } | null = null;
let productsCache: { data: ProductsResponse; ts: number } | null = null;
let opportunitiesListCache: { key: string; data: Opportunity[]; ts: number } | null = null;
const feedbackListCacheMap = new Map<string, { data: FeedbackListResponse; ts: number }>();

const inFlightOpportunity = new Map<string, Promise<Opportunity | null>>();
let inFlightDimensions: Promise<Dimension[]> | null = null;
let inFlightProducts: Promise<ProductsResponse> | null = null;

function isStale<T>(entry: { data: T; ts: number } | null): boolean {
  return !entry || Date.now() - entry.ts > TTL_MS;
}

function isFeedbackListStale(entry: { data: FeedbackListResponse; ts: number } | null): boolean {
  return !entry || Date.now() - entry.ts > FEEDBACK_LIST_TTL_MS;
}

export function getFeedbackListCacheKey(params: {
  productIds: string[];
  status: string;
  page: number;
  sortDir?: string;
}): string {
  const sorted = [...params.productIds].sort();
  return [sorted.join(","), params.status, params.page, params.sortDir ?? "desc"].join("|");
}

export function getCachedFeedbackList(key: string): FeedbackListResponse | null {
  const entry = feedbackListCacheMap.get(key);
  if (!entry || isFeedbackListStale(entry)) return null;
  return entry.data;
}

export function setCachedFeedbackList(key: string, data: FeedbackListResponse): void {
  if (feedbackListCacheMap.size >= FEEDBACK_LIST_MAX_ENTRIES) {
    const oldestKey = feedbackListCacheMap.keys().next().value;
    if (oldestKey !== undefined) feedbackListCacheMap.delete(oldestKey);
  }
  feedbackListCacheMap.set(key, { data, ts: Date.now() });
}

export function invalidateFeedbackListCache(): void {
  feedbackListCacheMap.clear();
}

export function getOpportunitiesListCacheKey(params: {
  productFilter: string;
  horizonFilter: string;
  statusFilter: string;
}): string {
  return [params.productFilter, params.horizonFilter, params.statusFilter].join("|");
}

export function getCachedOpportunitiesList(key: string): Opportunity[] | null {
  if (!opportunitiesListCache || opportunitiesListCache.key !== key) return null;
  if (isStale(opportunitiesListCache)) return null;
  return opportunitiesListCache.data;
}

export function setCachedOpportunitiesList(key: string, data: Opportunity[]): void {
  opportunitiesListCache = { key, data, ts: Date.now() };
}

/** Fetches one opportunity by id; deduplicates in-flight requests (e.g. Strict Mode double-mount). */
export function fetchOpportunity(id: string): Promise<Opportunity | null> {
  const existing = inFlightOpportunity.get(id);
  if (existing) return existing;
  const p = fetch(`/api/opportunities/${id}`)
    .then((res) => {
      inFlightOpportunity.delete(id);
      if (!res.ok) return null;
      return res.json();
    })
    .catch(() => {
      inFlightOpportunity.delete(id);
      return null;
    });
  inFlightOpportunity.set(id, p);
  return p;
}

function isStaticDataStale<T>(entry: { data: T; ts: number } | null): boolean {
  return !entry || Date.now() - entry.ts > STATIC_DATA_TTL_MS;
}

export async function getCachedDimensions(): Promise<Dimension[]> {
  if (!isStaticDataStale(dimensionsCache)) return dimensionsCache!.data;
  if (inFlightDimensions) return inFlightDimensions;
  const p = fetch("/api/dimensions")
    .then((res) => {
      inFlightDimensions = null;
      if (!res.ok) throw new Error("Failed to fetch dimensions");
      return res.json();
    })
    .then((data) => {
      dimensionsCache = { data, ts: Date.now() };
      return data;
    })
    .catch((err) => {
      inFlightDimensions = null;
      throw err;
    });
  inFlightDimensions = p;
  return p;
}

export async function getCachedProductsRaw(): Promise<ProductsResponse> {
  if (!isStaticDataStale(productsCache)) return productsCache!.data;
  if (inFlightProducts) return inFlightProducts;
  const p = fetch("/api/products")
    .then((res) => {
      inFlightProducts = null;
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    })
    .then((json) => {
      const data: ProductsResponse = { flat: json.flat || [], tree: json.tree || [] };
      productsCache = { data, ts: Date.now() };
      return data;
    })
    .catch((err) => {
      inFlightProducts = null;
      throw err;
    });
  inFlightProducts = p;
  return p;
}

export async function getCachedProducts(): Promise<ProductFlat> {
  const data = await getCachedProductsRaw();
  return data.flat;
}

export function invalidateProductsCache(): void {
  productsCache = null;
}
