"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { type DimensionConfig } from "@/lib/score";
import type { FeatureRow } from "@/types";

const PAGE_SIZE = 50;

interface FeedbackPageContentProps {
  initialProductId?: string | null;
}

export default function FeedbackPageContent({ initialProductId }: FeedbackPageContentProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [dimensions, setDimensions] = useState<DimensionConfig[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; featureCount: number }[]>([]);
  const [productFilter, setProductFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<FeatureRow>>>(new Map());

  // Initialize filters from URL params or prop
  useEffect(() => {
    const urlProductId = initialProductId !== undefined ? initialProductId : searchParams?.get("productId");
    if (urlProductId) {
      setProductFilter(urlProductId);
    }
  }, [searchParams, initialProductId]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (productFilter) params.set("productId", productFilter);
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    const res = await fetch(`/api/features?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Failed to load features:", err.error || res.status);
      return;
    }
    const data = await res.json();
    setFeatures(data.features ?? []);
    setDimensions(data.dimensions ?? []);
    setProducts(data.products ?? []);
    setTotalPages(data.pagination?.totalPages ?? 1);
  }, [productFilter, page]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [productFilter]);

  // Note: URL updates removed - handled by Next.js routing

  const updateScoreOptimistic = useCallback((featureId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
    setPendingUpdates((prev) => {
      const next = new Map(prev);
      const existing = next.get(featureId) || {};
      next.set(featureId, {
        ...existing,
        scores,
        explanation,
        combinedScore: computeCombinedScoreLocal(scores, dimensions),
      });
      return next;
    });
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId
          ? {
              ...f,
              scores,
              explanation,
              combinedScore: computeCombinedScoreLocal(scores, dimensions),
            }
          : f
      )
    );
  }, [dimensions]);

  const updateTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const debouncedUpdate = useCallback(
    (featureId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
      updateScoreOptimistic(featureId, scores, explanation);
      const existing = updateTimeouts.current.get(featureId);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(async () => {
        await fetch("/api/features", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: featureId, scores, explanation }),
        });
        setPendingUpdates((prev) => {
          const next = new Map(prev);
          next.delete(featureId);
          return next;
        });
        updateTimeouts.current.delete(featureId);
      }, 500);
      updateTimeouts.current.set(featureId, timeout);
    },
    [updateScoreOptimistic]
  );


  const displayedFeatures = useMemo(() => {
    return features.map((f) => {
      const pending = pendingUpdates.get(f.id);
      return pending ? { ...f, ...pending } : f;
    });
  }, [features, pendingUpdates]);

  const selectedProduct = products.find((p) => p.id === productFilter);
  
  // Check if viewing a parent product (has features from multiple products)
  const isViewingParentProduct = useMemo(() => {
    if (!productFilter || !selectedProduct) return false;
    const uniqueProductIds = new Set(displayedFeatures.map((f) => f.productId).filter(Boolean));
    return uniqueProductIds.size > 1;
  }, [productFilter, selectedProduct, displayedFeatures]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {selectedProduct ? `${selectedProduct.name} Feedback` : "Feedback"}
          </h1>
          {selectedProduct && (
            <button
              onClick={() => {
                setProductFilter("");
                router.push("/feedback");
              }}
              className="text-sm text-gray-600 hover:text-gray-900 mt-1"
            >
              ← Show all feedback
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value);
              if (e.target.value) {
                // Find product and navigate to its slug path
                const product = products.find((p) => p.id === e.target.value);
                if (product) {
                  // We'll need to build the path - for now, use query param fallback
                  router.push(`/feedback?productId=${encodeURIComponent(e.target.value)}`);
                }
              } else {
                router.push("/feedback");
              }
            }}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="">All products</option>
            <option value="__unassigned__">Unassigned</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.featureCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : displayedFeatures.length === 0 ? (
        <p className="text-gray-500">No feedback yet. Import a CSV to get started.</p>
      ) : (
        <>
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                    Title
                  </th>
                  {dimensions.map((d) => (
                    <th key={d.id} scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-24">
                      {d.name}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedFeatures.map((f, idx) => {
                  const prevFeature = idx > 0 ? displayedFeatures[idx - 1] : null;
                  const productChanged = prevFeature && prevFeature.productId !== f.productId;
                  const showProductHeader = isViewingParentProduct && (idx === 0 || productChanged);

                  return (
                    <React.Fragment key={f.id}>
                      {showProductHeader && (
                        <tr className="bg-gray-100">
                          <td
                            colSpan={1 + dimensions.length + 1}
                            className="py-2 px-4 text-sm font-semibold text-gray-900 sm:px-6"
                          >
                            {f.productName || "Unassigned"}
                          </td>
                        </tr>
                      )}
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                      >
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                          {f.title}
                        </td>
                        {dimensions.map((d) => (
                          <td key={d.id} className="whitespace-nowrap px-3 py-4 text-sm text-gray-500" onClick={(e) => e.stopPropagation()}>
                            <ScoreCell
                              dimension={d}
                              value={f.scores[d.id]}
                              onChange={(value) => {
                                debouncedUpdate(f.id, { ...f.scores, [d.id]: value }, f.explanation);
                              }}
                            />
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                          {f.combinedScore}
                        </td>
                      </tr>
                      {expandedId === f.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={1 + dimensions.length + 1} className="px-4 py-4 text-sm sm:px-6">
                            <div className="space-y-2">
                              {f.description && (
                                <p className="text-gray-600">{f.description}</p>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {dimensions.map((d) => (
                                  <div key={d.id}>
                                    <span className="font-medium text-gray-700">{d.name}:</span>{" "}
                                    {f.scores[d.id] ?? "—"}
                                    {f.explanation[d.id] && (
                                      <p className="text-gray-500 mt-0.5">{f.explanation[d.id]}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function computeCombinedScoreLocal(scores: Record<string, number>, dimensions: DimensionConfig[]): number {
  let total = 0;
  for (const d of dimensions) {
    const v = scores[d.id];
    if (v === undefined) continue;
    total += v * d.weight;
  }
  return Math.round(total * 10) / 10;
}

const ScoreCell = React.memo(function ScoreCell({
  dimension,
  value,
  onChange,
}: {
  dimension: DimensionConfig;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  if (dimension.type === "yesno") {
    return (
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(1)}
          className={`px-2 py-0.5 rounded text-xs ${value === 1 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`px-2 py-0.5 rounded text-xs ${value === 0 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          No
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-7 py-0.5 rounded text-xs ${value === n ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-700"}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
});
