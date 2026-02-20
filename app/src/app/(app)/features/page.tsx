"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { type DimensionConfig, computeCombinedScore } from "@/lib/score";
import type { FeatureRow } from "@/types";

const PAGE_SIZE = 50;

export default function FeaturesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [dimensions, setDimensions] = useState<DimensionConfig[]>([]);
  const [clusters, setClusters] = useState<{ id: string; name: string; featureCount: number }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; featureCount: number }[]>([]);
  const [totalUnassigned, setTotalUnassigned] = useState(0);
  const [clusterFilter, setClusterFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<FeatureRow>>>(new Map());

  // Initialize filters from URL params
  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    const urlClusterId = searchParams?.get("clusterId");
    if (urlProductId) {
      setProductFilter(urlProductId);
    }
    if (urlClusterId) {
      setClusterFilter(urlClusterId);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (clusterFilter) params.set("clusterId", clusterFilter);
    if (productFilter) params.set("productId", productFilter);
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    const res = await fetch(`/api/features?${params}`);
    const data = await res.json();
    if (res.ok) {
      setFeatures(data.features ?? []);
      setDimensions(data.dimensions ?? []);
      setClusters(data.clusters ?? []);
      setProducts(data.products ?? []);
      setTotalUnassigned(data.totalUnassigned ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    }
  }, [clusterFilter, productFilter, page]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [clusterFilter, productFilter]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (productFilter) params.set("productId", productFilter);
    if (clusterFilter) params.set("clusterId", clusterFilter);
    const newUrl = params.toString() ? `/features?${params.toString()}` : "/features";
    router.replace(newUrl, { scroll: false });
  }, [productFilter, clusterFilter, router]);

  const updateScoreOptimistic = useCallback((featureId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
    setPendingUpdates((prev) => {
      const next = new Map(prev);
      const existing = next.get(featureId) || {};
      next.set(featureId, {
        ...existing,
        scores,
        explanation,
        combinedScore: computeCombinedScore(scores, dimensions),
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
              combinedScore: computeCombinedScore(scores, dimensions),
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

  async function runAutoCluster() {
    setClustering(true);
    try {
      const res = await fetch("/api/clusters/auto", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-cluster failed");
      setClusters(data.clusters ?? []);
      setClusterFilter("");
      setShowReview(true);
      setPage(1);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Auto-cluster failed");
    } finally {
      setClustering(false);
    }
  }

  async function updateClusterName(clusterId: string, name: string) {
    await fetch("/api/clusters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: clusterId, name }),
    });
    setRenameId(null);
    setRenameValue("");
    load();
  }

  async function mergeClusters(sourceId: string, targetId: string) {
    await fetch("/api/clusters/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId }),
    });
    load();
  }

  async function moveFeature(featureId: string, clusterId: string | null) {
    await fetch("/api/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: featureId, clusterId }),
    });
    load();
  }

  const displayedFeatures = useMemo(() => {
    return features.map((f) => {
      const pending = pendingUpdates.get(f.id);
      return pending ? { ...f, ...pending } : f;
    });
  }, [features, pendingUpdates]);

  const selectedProduct = products.find((p) => p.id === productFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {selectedProduct ? `${selectedProduct.name} Features` : "Feature list"}
          </h1>
          {selectedProduct && (
            <button
              onClick={() => setProductFilter("")}
              className="text-sm text-gray-600 hover:text-gray-900 mt-1"
            >
              ← Show all products
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
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
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="">All clusters</option>
            <option value="__unassigned__">Unassigned</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.featureCount})
              </option>
            ))}
          </select>
          <button
            onClick={runAutoCluster}
            disabled={clustering || totalUnassigned === 0}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-50"
          >
            {clustering ? "Clustering…" : "Auto-cluster"}
          </button>
        </div>
      </div>

      {showReview && clusters.length > 0 && (
        <div className="p-4 border border-gray-200 rounded bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Review clusters</h2>
            <button
              onClick={() => setShowReview(false)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Done
            </button>
          </div>
          <ul className="space-y-2">
            {clusters.map((c) => (
              <li key={c.id} className="flex items-center gap-2 flex-wrap">
                {renameId === c.id ? (
                  <>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="px-2 py-1 border rounded text-sm w-48"
                    />
                    <button
                      onClick={() => updateClusterName(c.id, renameValue)}
                      className="text-sm text-gray-700 hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setRenameId(null); setRenameValue(""); }}
                      className="text-sm text-gray-500"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-gray-500 text-sm">({c.featureCount})</span>
                    <button
                      onClick={() => { setRenameId(c.id); setRenameValue(c.name); }}
                      className="text-sm text-gray-600 hover:underline"
                    >
                      Rename
                    </button>
                    <select
                      className="text-sm border rounded px-1"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) mergeClusters(c.id, v);
                      }}
                      value=""
                    >
                      <option value="">Merge into…</option>
                      {clusters.filter((x) => x.id !== c.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : displayedFeatures.length === 0 ? (
        <p className="text-gray-500">No features yet. Import a CSV to get started.</p>
      ) : (
        <>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Title</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Cluster</th>
                  {dimensions.map((d) => (
                    <th key={d.id} className="text-left py-2 px-3 font-medium text-gray-700 w-24">
                      {d.name}
                    </th>
                  ))}
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Score</th>
                </tr>
              </thead>
              <tbody>
                {displayedFeatures.map((f) => (
                  <React.Fragment key={f.id}>
                    <tr
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    >
                      <td className="py-2 px-3">{f.title}</td>
                      <td className="py-2 px-3">
                        <select
                          value={f.clusterId ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => moveFeature(f.id, e.target.value || null)}
                          className="border rounded px-2 py-0.5 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {clusters.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      {dimensions.map((d) => (
                        <td key={d.id} className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <ScoreCell
                            dimension={d}
                            value={f.scores[d.id]}
                            onChange={(value) => {
                              debouncedUpdate(f.id, { ...f.scores, [d.id]: value }, f.explanation);
                            }}
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 font-medium">{f.combinedScore}</td>
                    </tr>
                    {expandedId === f.id && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={3 + dimensions.length + 1} className="py-3 px-3">
                          <div className="text-sm space-y-2">
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
                ))}
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
