"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { PlusIcon, ArrowsPointingInIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import type { Opportunity, Dimension } from "@/types";
import { parseScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";
import {
  getCachedDimensions,
  getCachedProducts,
  getOpportunitiesListCacheKey,
  getCachedOpportunitiesList,
  setCachedOpportunitiesList,
  fetchOpportunity,
  invalidateFeedbackListCache,
} from "@/lib/cache";
import { OpportunityModal } from "@/components/OpportunityModal";
import { OpportunityDetailPanel } from "@/components/OpportunityDetailPanel";
import { Button, Textarea } from "@/components/ui";

type SortField = "title" | "product" | "feedback" | "score" | "createdAt";
type SortDirection = "asc" | "desc";
type TabValue = "all" | "not_on_roadmap" | "on_roadmap" | "archived";

const TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_on_roadmap", label: "Not on Roadmap" },
  { value: "on_roadmap", label: "On Roadmap" },
  { value: "archived", label: "Archived" },
];

/** Colored dot indicating idea count / signal strength */
function StrengthDot({ count }: { count: number }) {
  const color = count >= 5 ? "bg-green-500" : count >= 3 ? "bg-yellow-400" : "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} title={`${count} idea${count !== 1 ? "s" : ""}`} />;
}

export default function OpportunitiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("all");
  const [sortField, setSortField] = useState<SortField>("feedback");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<Opportunity>>>(new Map());
  const [goals, setGoals] = useState<{ id: string; title: string; status: string }[]>([]);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMeta, setSelectedMeta] = useState<Map<string, { title: string; feedbackCount: number }>>(new Map());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTitle, setMergeTitle] = useState("");
  const [mergeTitleLoading, setMergeTitleLoading] = useState(false);
  const [showAllMergeOpps, setShowAllMergeOpps] = useState(false);
  const [merging, setMerging] = useState(false);

  // Live grouping indicator + polling
  const [groupingActive, setGroupingActive] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.ok ? r.json() : { goals: [] })
      .then((d) => setGoals(d.goals ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = searchParams?.get("tab") as TabValue | null;
    setTab(TABS.some((x) => x.value === t) ? (t as TabValue) : "all");
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

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    const cacheKey = getOpportunitiesListCacheKey({ productFilter: "", horizonFilter: "", statusFilter: "" });
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
  }, []);

  useEffect(() => {
    const cacheKey = getOpportunitiesListCacheKey({ productFilter: "", horizonFilter: "", statusFilter: "" });
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
  }, [load, dimensions.length, products.length]);

  // Fast poll (every 4s) during manual grouping, with indicator
  useEffect(() => {
    const startFastPolling = () => {
      setGroupingActive(true);
      if (pollingRef.current) return;
      pollingRef.current = setInterval(() => { load(); }, 4000);
      setTimeout(() => stopFastPolling(), 3 * 60 * 1000);
    };
    const stopFastPolling = () => {
      setGroupingActive(false);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
    const onComplete = () => { load(); stopFastPolling(); };

    if (sessionStorage.getItem("grouping")) startFastPolling();

    window.addEventListener("grouping-started", startFastPolling);
    window.addEventListener("grouping-complete", onComplete);
    return () => {
      window.removeEventListener("grouping-started", startFastPolling);
      window.removeEventListener("grouping-complete", onComplete);
      stopFastPolling();
    };
  }, [load]);

  // Slow background poll (every 60s) to catch automation-created opportunities
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") load(); };
    const id = setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const dimConfig: DimensionConfig[] = useMemo(
    () => dimensions.filter((d) => d.name.trim() !== "").map((d) => ({ id: d.id, name: d.name, type: d.type, weight: d.weight, order: d.order, tag: d.tag, direction: d.direction })),
    [dimensions]
  );

  const detailScoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleDetailUpdate = useCallback(async (id: string, updates: Partial<Opportunity>) => {
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
      const cacheKey = getOpportunitiesListCacheKey({ productFilter: "", horizonFilter: "", statusFilter: "" });
      setOpportunities((current) => { setCachedOpportunitiesList(cacheKey, current); return current; });
    } else {
      const data = await fetchOpportunity(id);
      if (data) setDetailOpportunity(data as Opportunity);
    }
  }, [detailOpportunity]);

  const handleDetailUpdateScore = useCallback((id: string, scores: Record<string, number>, explanation: Record<string, string>) => {
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
  }, [detailOpportunity, dimConfig]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection(field === "feedback" || field === "score" ? "desc" : "asc"); }
  };

  const allSelected = opportunities.length > 0 && opportunities.every((o) => selectedIds.has(o.id));
  const someSelected = opportunities.some((o) => selectedIds.has(o.id)) && !allSelected;

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) { opportunities.forEach((o) => next.delete(o.id)); }
      else { opportunities.forEach((o) => next.add(o.id)); }
      return next;
    });
    setSelectedMeta((prev) => {
      const next = new Map(prev);
      if (allSelected) { opportunities.forEach((o) => next.delete(o.id)); }
      else { opportunities.forEach((o) => next.set(o.id, { title: o.title, feedbackCount: o.feedbackCount })); }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    const opp = opportunities.find((o) => o.id === id);
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    setSelectedMeta((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (opp) next.set(id, { title: opp.title, feedbackCount: opp.feedbackCount });
      return next;
    });
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
        if (detailOpportunity && selectedIds.has(detailOpportunity.id)) closeDetail();
        setSelectedIds(new Set());
        setSelectedMeta(new Map());
        invalidateFeedbackListCache();
        window.dispatchEvent(new CustomEvent("feedback-imported"));
        await load();
      }
    } catch { /* ignore */ } finally {
      setBulkDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) return;
    setMergeTitle("");
    setShowAllMergeOpps(false);
    setShowMergeModal(true);
    setMergeTitleLoading(true);
    try {
      const res = await fetch("/api/opportunities/merge/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const data = await res.json();
        setMergeTitle(data.title ?? "");
      }
    } finally {
      setMergeTitleLoading(false);
    }
  };

  const handleMergeWith = useCallback(async (otherId: string) => {
    if (!detailOpportunity) return;
    const currentId = detailOpportunity.id;
    const otherOpp = opportunities.find((o) => o.id === otherId);
    const newIds = new Set([currentId, otherId]);
    setSelectedIds(newIds);
    setSelectedMeta(new Map([
      [currentId, { title: detailOpportunity.title, feedbackCount: detailOpportunity.feedbackCount }],
      [otherId, { title: otherOpp?.title ?? "", feedbackCount: otherOpp?.feedbackCount ?? 0 }],
    ]));
    closeDetail();
    // Open merge modal with explicit IDs (can't rely on selectedIds state being updated yet)
    setMergeTitle("");
    setShowAllMergeOpps(false);
    setShowMergeModal(true);
    setMergeTitleLoading(true);
    try {
      const res = await fetch("/api/opportunities/merge/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityIds: Array.from(newIds) }),
      });
      if (res.ok) {
        const data = await res.json();
        setMergeTitle(data.title ?? "");
      }
    } finally {
      setMergeTitleLoading(false);
    }
  }, [detailOpportunity, opportunities, closeDetail]);

  const handleConfirmMerge = async () => {
    if (merging || selectedIds.size < 2) return;
    setMerging(true);
    try {
      const res = await fetch("/api/opportunities/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityIds: Array.from(selectedIds), title: mergeTitle.trim() || undefined }),
      });
      if (!res.ok) return;
      setShowMergeModal(false);
      if (detailOpportunity && selectedIds.has(detailOpportunity.id)) closeDetail();
      setSelectedIds(new Set());
      setSelectedMeta(new Map());
      await load();
    } finally {
      setMerging(false);
    }
  };

  const displayedOpportunities = useMemo(() => {
    let filtered = opportunities.map((r) => {
      const pending = pendingUpdates.get(r.id);
      return pending ? { ...r, ...pending } : r;
    });

    if (tab === "not_on_roadmap") filtered = filtered.filter((o) => o.status === "not_on_roadmap");
    else if (tab === "on_roadmap") filtered = filtered.filter((o) => o.status === "on_roadmap");
    else if (tab === "archived") filtered = filtered.filter((o) => o.status === "archived");

    filtered.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortField) {
        case "title": aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); break;
        case "product": aVal = a.productName || ""; bVal = b.productName || ""; break;
        case "feedback": aVal = a.feedbackCount; bVal = b.feedbackCount; break;
        case "score": aVal = a.combinedScore; bVal = b.combinedScore; break;
        case "createdAt": aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break;
        default: return 0;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [opportunities, pendingUpdates, tab, sortField, sortDirection]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUpIcon className="ml-1 h-3.5 w-3.5 inline text-content-subtle opacity-50" />;
    return sortDirection === "asc"
      ? <ChevronUpIcon className="ml-1 h-3.5 w-3.5 inline" />
      : <ChevronDownIcon className="ml-1 h-3.5 w-3.5 inline" />;
  }

  const tabCounts = useMemo(() => ({
    not_on_roadmap: opportunities.filter((o) => o.status === "not_on_roadmap").length,
    on_roadmap: opportunities.filter((o) => o.status === "on_roadmap").length,
    archived: opportunities.filter((o) => o.status === "archived").length,
  }), [opportunities]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-content">Opportunities</h1>
          {groupingActive && (
            <span className="flex items-center gap-1.5 text-xs text-content-muted">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Grouping ideas…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size >= 2 && (
            <Button onClick={handleMerge} disabled={merging}>
              <ArrowsPointingInIcon className="w-4 h-4" />
              Merge ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" onClick={() => setShowModal(true)}>
            <PlusIcon className="w-4 h-4" />
            New opportunity
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => {
            const badge = t.value !== "all" ? tabCounts[t.value as keyof typeof tabCounts] : undefined;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setTab(t.value);
                  const params = new URLSearchParams(searchParams?.toString() || "");
                  if (t.value === "all") { params.delete("tab"); } else { params.set("tab", t.value); }
                  const query = params.toString();
                  router.push(query ? `/opportunities?${query}` : "/opportunities");
                }}
                className={`py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 transition-colors ${
                  tab === t.value
                    ? "border-content text-content"
                    : "border-transparent text-content-muted hover:text-content hover:border-border-strong"
                }`}
              >
                {t.label}
                {badge !== undefined && badge > 0 && (
                  <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-content-muted">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-muted">{selectedIds.size} selected</span>
          <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting} loading={bulkDeleting}>
            {!bulkDeleting && <TrashIcon className="w-4 h-4" />}
            {bulkDeleting ? "Deleting…" : "Delete"}
          </Button>
          <button onClick={() => { setSelectedIds(new Set()); setSelectedMeta(new Map()); }} className="text-sm text-content-subtle hover:text-content-muted">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-content-muted">Loading…</p>
      ) : displayedOpportunities.length === 0 ? (
        <div className="text-center py-16 text-content-muted">
          <p className="text-base mb-1">No opportunities{tab !== "all" ? ` in "${TABS.find((t) => t.value === tab)?.label}"` : ""} yet.</p>
          <p className="text-sm">Import feedback, then click &ldquo;Group ideas&rdquo; to generate opportunities automatically.</p>
        </div>
      ) : (
        <div className="bg-surface shadow ring-1 ring-border ring-opacity-5 md:rounded-lg overflow-hidden">
          <table className="w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-2 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                  />
                </th>
                <th scope="col" className="py-3.5 pl-2 pr-3 text-left text-sm font-semibold text-content cursor-pointer hover:bg-surface-subtle select-none whitespace-nowrap" onClick={() => handleSort("title")}>
                  Title <SortIcon field="title" />
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content cursor-pointer hover:bg-surface-subtle select-none whitespace-nowrap" onClick={() => handleSort("feedback")}>
                  Ideas <SortIcon field="feedback" />
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content cursor-pointer hover:bg-surface-subtle select-none whitespace-nowrap" onClick={() => handleSort("score")}>
                  Score <SortIcon field="score" />
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content cursor-pointer hover:bg-surface-subtle select-none whitespace-nowrap" onClick={() => handleSort("product")}>
                  Product <SortIcon field="product" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {displayedOpportunities.map((opp) => {
                const isSelected = selectedIds.has(opp.id);
                return (
                  <tr
                    key={opp.id}
                    className={`hover:bg-surface-muted cursor-pointer ${isSelected ? "bg-surface-subtle hover:bg-surface-subtle" : ""}`}
                    onClick={() => openDetail(opp)}
                  >
                    <td className="py-4 pl-4 pr-2 w-8" onClick={(e) => { e.stopPropagation(); toggleOne(opp.id); }}>
                      <input type="checkbox" className="rounded border-border" checked={isSelected} onChange={() => {}} />
                    </td>
                    <td className="py-4 pl-2 pr-3 text-sm font-medium text-content">{opp.title}</td>
                    <td className="px-3 py-4 text-sm text-content-muted">
                      <div className="flex items-center gap-2">
                        <StrengthDot count={opp.feedbackCount} />
                        <span className="tabular-nums font-medium">{opp.feedbackCount}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-content-muted">
                      {opp.combinedScore > 0 ? <span>{opp.combinedScore}</span> : <span className="text-content-subtle">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-content-muted">
                      {opp.productName || <span className="text-content-subtle">—</span>}
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
          goals={goals}
          onClose={closeDetail}
          onUpdate={handleDetailUpdate}
          onUpdateScore={handleDetailUpdateScore}
          onMergeWith={handleMergeWith}
        />
      )}

      <OpportunityModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(opp) => { load(); setShowModal(false); openDetail(opp); }}
        products={products}
      />

      {/* Merge modal */}
      {showMergeModal && (() => {
        const mergeList = Array.from(selectedMeta.values());
        const unknownCount = selectedIds.size - mergeList.length;
        const displayTitle = mergeTitle.trim() || "…";
        return createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand/40 backdrop-blur-[1px]">
            <div className="bg-surface rounded-xl shadow-2xl ring-1 ring-border w-full max-w-xl p-6">
              <h2 className="text-lg font-semibold text-content mb-4">Merge Opportunities</h2>

              <div className="mb-5">
                <label className="block text-xs font-medium text-content-subtle uppercase tracking-wider mb-1.5">Opportunities</label>
                <ul className="space-y-1.5">
                  {(showAllMergeOpps ? mergeList : mergeList.slice(0, 2)).map((o, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
                      <p className="text-sm text-content flex-1">{o.title}</p>
                      <span className="text-xs text-content-subtle whitespace-nowrap flex-shrink-0 mt-0.5">
                        {o.feedbackCount} idea{o.feedbackCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                  {unknownCount > 0 && showAllMergeOpps && (
                    <li className="text-xs text-content-subtle italic px-1">+ {unknownCount} more</li>
                  )}
                </ul>
                {(mergeList.length > 2 || unknownCount > 0) && (
                  <button onClick={() => setShowAllMergeOpps((v) => !v)} className="mt-1.5 text-xs text-content-subtle hover:text-content-muted">
                    {showAllMergeOpps ? "Show less" : `Show ${mergeList.length - 2 + unknownCount} more…`}
                  </button>
                )}
              </div>

              <div className="mb-5">
                <label className="block text-xs font-medium text-content-subtle uppercase tracking-wider mb-1.5">New title</label>
                {mergeTitleLoading ? (
                  <div className="h-16 bg-surface-subtle rounded-md animate-pulse" />
                ) : (
                  <Textarea value={mergeTitle} onChange={(e) => setMergeTitle(e.target.value)} rows={3} placeholder="Opportunity title…" />
                )}
              </div>

              <div className="mb-6 rounded-lg bg-surface-muted border border-border px-4 py-3">
                <p className="text-xs font-medium text-content-subtle uppercase tracking-wider mb-1">What&apos;s going to happen</p>
                <p className="text-sm text-content-muted">
                  {selectedIds.size} opportunit{selectedIds.size !== 1 ? "ies" : "y"} will be merged into{" "}
                  <span className="font-medium text-content">&ldquo;{displayTitle}&rdquo;</span>
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowMergeModal(false)} disabled={merging}>Cancel</Button>
                <Button onClick={handleConfirmMerge} disabled={merging || mergeTitleLoading || !mergeTitle.trim()} loading={merging}>
                  {merging ? "Merging…" : `Merge ${selectedIds.size}`}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
