"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Opportunity, Dimension } from "@/types";
import { parseScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";
import {
  getCachedDimensions,
  getCachedProducts,
  getOpportunitiesListCacheKey,
  getCachedOpportunitiesList,
  setCachedOpportunitiesList,
  fetchOpportunity,
} from "@/lib/cache";
import { OpportunityModal } from "@/components/OpportunityModal";
import { OpportunityDetailPanel } from "@/components/OpportunityDetailPanel";


type SortField = "title" | "product" | "feedback" | "score" | "horizon" | "quarter" | "status" | "createdAt";
type SortDirection = "asc" | "desc";

interface ApplyResult {
  message: string;
  created: number;
  opportunities: { id: string; title: string; feedbackCount: number }[];
}

export default function OpportunitiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [productFilter, setProductFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [horizonFilter, setHorizonFilter] = useState<string>("");
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sortField, setSortField] = useState<SortField>("feedback");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<Opportunity>>>(new Map());
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) setProductFilter(urlProductId);
  }, [searchParams]);

  const openIdFromUrl = searchParams?.get("open");
  useEffect(() => {
    if (!openIdFromUrl || detailOpportunity?.id === openIdFromUrl) return;
    setDetailLoading(true);
    fetchOpportunity(openIdFromUrl).then((data) => {
      if (data) {
        setDetailOpportunity(data as Opportunity);
        window.history.replaceState(null, "", `/opportunities/${openIdFromUrl}`);
      }
      setDetailLoading(false);
    });
  }, [openIdFromUrl]);

  const urlProductId = searchParams?.get("productId") ?? "";
  const urlHorizon = searchParams?.get("horizon") ?? "";
  const urlStatus = searchParams?.get("status") ?? "";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (urlProductId) params.set("productId", urlProductId);
    if (urlHorizon) params.set("horizon", urlHorizon);
    if (urlStatus) params.set("status", urlStatus);
    const cacheKey = getOpportunitiesListCacheKey({
      productFilter: urlProductId,
      horizonFilter: urlHorizon,
      statusFilter: urlStatus,
    });
    try {
      const [oppRes, dimData, prodData] = await Promise.all([
        fetch(`/api/opportunities?${params}`),
        getCachedDimensions(),
        getCachedProducts(),
      ]);
      if (oppRes.ok) {
        const data = await oppRes.json();
        setOpportunities(data);
        setCachedOpportunitiesList(cacheKey, data);
      }
      setDimensions(dimData);
      setProducts(prodData);
    } catch (e) {
      console.error("Failed to load data", e);
    }
  }, [urlProductId, urlHorizon, urlStatus]);

  useEffect(() => {
    const cacheKey = getOpportunitiesListCacheKey({
      productFilter: urlProductId,
      horizonFilter: urlHorizon,
      statusFilter: urlStatus,
    });
    const cached = getCachedOpportunitiesList(cacheKey);
    if (cached) {
      setOpportunities(cached);
      setLoading(false);
      if (dimensions.length === 0) getCachedDimensions().then(setDimensions).catch(() => {});
      if (products.length === 0) getCachedProducts().then(setProducts).catch(() => {});
    } else {
      setLoading(true);
      load().finally(() => setLoading(false));
    }
  }, [load, urlProductId, urlHorizon, urlStatus, dimensions.length, products.length]);

  const dimConfig: DimensionConfig[] = useMemo(
    () =>
      dimensions.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        weight: d.weight,
        order: d.order,
        tag: d.tag,
        direction: d.direction,
      })),
    [dimensions]
  );

  const updateScoreOptimistic = useCallback(
    (opportunityId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        const existing = next.get(opportunityId) || {};
        next.set(opportunityId, { ...existing, scores, explanation, combinedScore: computeCombinedScore(scores, dimConfig) });
        return next;
      });
      setOpportunities((prev) =>
        prev.map((r) =>
          r.id === opportunityId
            ? { ...r, scores, explanation, combinedScore: computeCombinedScore(scores, dimConfig) }
            : r
        )
      );
    },
    [dimConfig]
  );

  const updateTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const debouncedUpdate = useCallback(
    (opportunityId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
      updateScoreOptimistic(opportunityId, scores, explanation);
      const existing = updateTimeouts.current.get(opportunityId);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(async () => {
        await fetch("/api/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: opportunityId, scores, explanation }),
        });
        setPendingUpdates((prev) => { const next = new Map(prev); next.delete(opportunityId); return next; });
        updateTimeouts.current.delete(opportunityId);
      }, 500);
      updateTimeouts.current.set(opportunityId, timeout);
    },
    [updateScoreOptimistic]
  );

  const openDetail = useCallback(async (opp: Opportunity) => {
    setDetailOpportunity(opp);
    window.history.replaceState(null, "", `/opportunities/${opp.id}`);
    setDetailLoading(true);
    const [fresh, dimData, prodData] = await Promise.all([
      fetchOpportunity(opp.id),
      getCachedDimensions().catch(() => dimensions),
      getCachedProducts().catch(() => products),
    ]);
    if (fresh) setDetailOpportunity(fresh as Opportunity);
    if (dimData) setDimensions(dimData);
    if (prodData) setProducts(prodData);
    setDetailLoading(false);
  }, [dimensions, products]);

  const closeDetail = useCallback(() => {
    setDetailOpportunity(null);
    window.history.replaceState(null, "", "/opportunities");
  }, []);

  const handleDetailUpdate = useCallback(
    async (id: string, updates: Partial<Opportunity>) => {
      if (!detailOpportunity || detailOpportunity.id !== id) return;
      setDetailOpportunity((prev) => (prev ? { ...prev, ...updates } : null));
      setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
      const res = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetailOpportunity((prev) => (prev ? { ...prev, ...updated } : null));
        setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
        const cacheKey = getOpportunitiesListCacheKey({ productFilter: urlProductId, horizonFilter: urlHorizon, statusFilter: urlStatus });
        setOpportunities((current) => { setCachedOpportunitiesList(cacheKey, current); return current; });
      } else {
        const data = await fetchOpportunity(id);
        if (data) setDetailOpportunity(data as Opportunity);
      }
    },
    [detailOpportunity, urlProductId, urlHorizon, urlStatus]
  );

  const detailScoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleDetailUpdateScore = useCallback(
    (id: string, scores: Record<string, number>, explanation: Record<string, string>) => {
      if (!detailOpportunity || detailOpportunity.id !== id) return;
      const combinedScore = computeCombinedScore(scores, dimConfig);
      setDetailOpportunity((prev) => prev ? { ...prev, scores, explanation, combinedScore } : null);
      setOpportunities((prev) => prev.map((o) => o.id === id ? { ...o, scores, explanation, combinedScore } : o));
      if (detailScoreTimeoutRef.current) clearTimeout(detailScoreTimeoutRef.current);
      detailScoreTimeoutRef.current = setTimeout(async () => {
        detailScoreTimeoutRef.current = null;
        await fetch("/api/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, scores, explanation }),
        });
      }, 500);
    },
    [detailOpportunity, dimConfig]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "feedback" || field === "score" ? "desc" : "asc");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/opportunities/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        await load();
      }
    } catch {
      // ignore
    } finally {
      setBulkDeleting(false);
    }
  };

  const maxFeedbackCount = useMemo(
    () => Math.max(1, ...opportunities.map((o) => o.feedbackCount)),
    [opportunities]
  );

  const displayedOpportunities = useMemo(() => {
    let filtered = opportunities.map((r) => {
      const pending = pendingUpdates.get(r.id);
      return pending ? { ...r, ...pending } : r;
    });

    if (statusFilter) filtered = filtered.filter((o) => o.status === statusFilter);

    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "title": aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); break;
        case "product": aVal = a.productName || ""; bVal = b.productName || ""; break;
        case "feedback": aVal = a.feedbackCount; bVal = b.feedbackCount; break;
        case "score": aVal = a.combinedScore; bVal = b.combinedScore; break;
        case "horizon": aVal = a.horizon || ""; bVal = b.horizon || ""; break;
        case "quarter": aVal = a.quarter || ""; bVal = b.quarter || ""; break;
        case "status": aVal = a.status; bVal = b.status; break;
        case "createdAt": aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break;
        default: return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [opportunities, pendingUpdates, statusFilter, sortField, sortDirection]);

  function getStatusColor(status: Opportunity["status"]): string {
    switch (status) {
      case "draft": return "bg-gray-200 text-gray-700";
      case "under_review": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-blue-100 text-blue-800";
      case "on_roadmap": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-200 text-gray-700";
    }
  }

  function getStatusLabel(status: Opportunity["status"]): string {
    switch (status) {
      case "draft": return "Draft";
      case "under_review": return "Under Review";
      case "approved": return "Approved";
      case "on_roadmap": return "On Roadmap";
      case "rejected": return "Rejected";
      default: return status;
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Opportunities</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800"
          >
            New opportunity
          </button>
        </div>
      </div>

      {/* Apply result banner */}
      {applyResult && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-4 ${
          applyResult.created > 0 ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          <div>
            <p className="font-medium">{applyResult.message}</p>
            {applyResult.created > 0 && (
              <p className="mt-1 text-green-700">
                {applyResult.created} opportunities created and feedback items marked as reviewed.
              </p>
            )}
          </div>
          <button onClick={() => setApplyResult(null)} className="text-current opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value);
            if (e.target.value) {
              router.push(`/opportunities?productId=${encodeURIComponent(e.target.value)}`);
            } else {
              router.push("/opportunities");
            }
          }}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="on_roadmap">On Roadmap</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={horizonFilter}
          onChange={(e) => setHorizonFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="">All horizons</option>
          <option value="now">Now</option>
          <option value="next">Next</option>
          <option value="later">Later</option>
          <option value="__unplanned__">Unplanned</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="ml-auto px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-sm font-medium"
          >
            {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 border border-gray-600 hover:border-gray-400 rounded text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : displayedOpportunities.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-base mb-1">No opportunities yet.</p>
          <p className="text-sm">Import feedback, then use <strong>✦ Auto-group feedback</strong> to let AI group it for you.</p>
        </div>
      ) : (
        <div className="bg-white shadow ring-1 ring-black ring-opacity-5 md:rounded-lg overflow-hidden">
          <table className="w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-2 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedIds.size === displayedOpportunities.length && displayedOpportunities.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(displayedOpportunities.map((o) => o.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th
                  scope="col"
                  className="py-3.5 pl-2 pr-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("title")}
                >
                  Title <SortIcon field="title" />
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("product")}
                >
                  Product <SortIcon field="product" />
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none w-48"
                  onClick={() => handleSort("feedback")}
                >
                  Feedback <SortIcon field="feedback" />
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("score")}
                >
                  Score <SortIcon field="score" />
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("status")}
                >
                  Status <SortIcon field="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {displayedOpportunities.map((opp) => {
                const barWidth = Math.round((opp.feedbackCount / maxFeedbackCount) * 100);
                const isSelected = selectedIds.has(opp.id);
                return (
                  <tr
                    key={opp.id}
                    className={`hover:bg-gray-50 cursor-pointer ${isSelected ? "bg-blue-50" : ""}`}
                    onClick={() => openDetail(opp)}
                  >
                    <td
                      className="py-4 pl-4 pr-2 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          next.has(opp.id) ? next.delete(opp.id) : next.add(opp.id);
                          return next;
                        });
                      }}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={isSelected}
                        onChange={() => {}}
                      />
                    </td>
                    <td className="py-4 pl-2 pr-3 text-sm font-medium text-gray-900">
                      {opp.title}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {opp.productName || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-right tabular-nums font-medium">{opp.feedbackCount}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                          <div
                            className="bg-gray-700 h-1.5 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {opp.combinedScore > 0 ? (
                        <span>{opp.combinedScore}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(opp.status)}`}>
                        {getStatusLabel(opp.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailOpportunity && (
        <OpportunityDetailPanel
          opportunity={detailOpportunity}
          dimensions={dimensions}
          products={products}
          onClose={closeDetail}
          onUpdate={handleDetailUpdate}
          onUpdateScore={handleDetailUpdateScore}
        />
      )}

      <OpportunityModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(opp) => {
          load();
          setShowModal(false);
          openDetail(opp);
        }}
        products={products}
      />

    </div>
  );
}
