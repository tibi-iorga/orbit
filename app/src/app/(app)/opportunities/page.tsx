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
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<Opportunity>>>(new Map());
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) {
      setProductFilter(urlProductId);
    }
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
      } else {
        console.error("Failed to load opportunities");
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
      if (dimensions.length === 0) {
        getCachedDimensions().then(setDimensions).catch(() => {});
      }
      if (products.length === 0) {
        getCachedProducts().then(setProducts).catch(() => {});
      }
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
      })),
    [dimensions]
  );

  const updateScoreOptimistic = useCallback(
    (opportunityId: string, scores: Record<string, number>, explanation: Record<string, string>) => {
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        const existing = next.get(opportunityId) || {};
        next.set(opportunityId, {
          ...existing,
          scores,
          explanation,
          combinedScore: computeCombinedScore(scores, dimConfig),
        });
        return next;
      });
      setOpportunities((prev) =>
        prev.map((r) =>
          r.id === opportunityId
            ? {
                ...r,
                scores,
                explanation,
                combinedScore: computeCombinedScore(scores, dimConfig),
              }
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
        setPendingUpdates((prev) => {
          const next = new Map(prev);
          next.delete(opportunityId);
          return next;
        });
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
      setOpportunities((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
      );
      const res = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetailOpportunity((prev) => (prev ? { ...prev, ...updated } : null));
        setOpportunities((prev) =>
          prev.map((o) => (o.id === id ? { ...o, ...updated } : o))
        );
        const cacheKey = getOpportunitiesListCacheKey({
          productFilter: urlProductId,
          horizonFilter: urlHorizon,
          statusFilter: urlStatus,
        });
        setOpportunities((current) => {
          setCachedOpportunitiesList(cacheKey, current);
          return current;
        });
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
      setDetailOpportunity((prev) =>
        prev ? { ...prev, scores, explanation, combinedScore } : null
      );
      setOpportunities((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, scores, explanation, combinedScore } : o
        )
      );
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
      setSortDirection("asc");
    }
  };

  const displayedOpportunities = useMemo(() => {
    let filtered = opportunities.map((r) => {
      const pending = pendingUpdates.get(r.id);
      return pending ? { ...r, ...pending } : r;
    });

    if (statusFilter) {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "product":
          aVal = a.productName || "";
          bVal = b.productName || "";
          break;
        case "feedback":
          aVal = a.feedbackCount;
          bVal = b.feedbackCount;
          break;
        case "score":
          aVal = a.combinedScore;
          bVal = b.combinedScore;
          break;
        case "horizon":
          aVal = a.horizon || "";
          bVal = b.horizon || "";
          break;
        case "quarter":
          aVal = a.quarter || "";
          bVal = b.quarter || "";
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "createdAt":
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [opportunities, pendingUpdates, statusFilter, sortField, sortDirection]);

  function getStatusColor(status: Opportunity["status"]): string {
    switch (status) {
      case "draft":
        return "bg-gray-200 text-gray-700";
      case "under_review":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-blue-100 text-blue-800";
      case "on_roadmap":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-200 text-gray-700";
    }
  }

  function getStatusLabel(status: Opportunity["status"]): string {
    switch (status) {
      case "draft":
        return "Draft";
      case "under_review":
        return "Under Review";
      case "approved":
        return "Approved";
      case "on_roadmap":
        return "On Roadmap";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Opportunities</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800"
        >
          New opportunity
        </button>
      </div>

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
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
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

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : displayedOpportunities.length === 0 ? (
        <p className="text-gray-500">No opportunities found.</p>
      ) : (
        <div className="bg-white shadow ring-1 ring-black ring-opacity-5 md:rounded-lg overflow-hidden">
          <table className="w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("title")}
                >
                  Title {sortField === "title" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("product")}
                >
                  Product {sortField === "product" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("feedback")}
                >
                  Feedback {sortField === "feedback" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("score")}
                >
                  Score {sortField === "score" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("horizon")}
                >
                  Horizon {sortField === "horizon" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("quarter")}
                >
                  Quarter {sortField === "quarter" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("status")}
                >
                  Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {displayedOpportunities.map((opp) => (
                <tr
                  key={opp.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => openDetail(opp)}
                >
                  <td className="py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    <span className="hover:text-gray-700">
                      {opp.title}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opp.productName || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opp.feedbackCount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opp.combinedScore > 0 ? (
                      <span>{opp.combinedScore}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opp.horizon ? (
                      <span className="px-2 py-0.5 bg-gray-200 rounded text-xs">{opp.horizon}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {opp.quarter || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(opp.status)}`}>
                      {getStatusLabel(opp.status)}
                    </span>
                  </td>
                </tr>
              ))}
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
