"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Opportunity, Dimension } from "@/types";
import { OpportunityDetailPanel } from "@/components/OpportunityDetailPanel";
import { getCachedDimensions, getCachedProducts, fetchOpportunity } from "@/lib/cache";
import { computeCombinedScore, type DimensionConfig } from "@/lib/score";
import { Select } from "@/components/ui";

export default function RoadmapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [productFilter, setProductFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) setProductFilter(urlProductId);
  }, [searchParams]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (productFilter) params.set("productId", productFilter);
    const [res, dimData, prodData] = await Promise.all([
      fetch(`/api/opportunities?${params}`),
      getCachedDimensions().catch(() => [] as Dimension[]),
      getCachedProducts().catch(() => [] as { id: string; name: string }[]),
    ]);
    if (res.ok) {
      const data: Opportunity[] = await res.json();
      // Only show on_roadmap opportunities on the roadmap
      setOpportunities(data.filter((o) => o.status === "on_roadmap"));
    }
    setDimensions(dimData);
    setProducts(prodData);
  }, [productFilter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const dimConfig: DimensionConfig[] = useMemo(
    () => dimensions.filter((d) => d.name.trim() !== "").map((d) => ({ id: d.id, name: d.name, type: d.type, weight: d.weight, order: d.order, tag: d.tag, direction: d.direction })),
    [dimensions]
  );

  const openDetail = useCallback(async (opp: Opportunity) => {
    setDetailOpportunity(opp);
    const fresh = await fetchOpportunity(opp.id);
    if (fresh) setDetailOpportunity(fresh as Opportunity);
  }, []);

  const handleDetailUpdate = useCallback(async (id: string, updates: Partial<Opportunity>) => {
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
    }
  }, []);

  const handleDetailUpdateScore = useCallback((id: string, scores: Record<string, number>, explanation: Record<string, string>) => {
    const combinedScore = computeCombinedScore(scores, dimConfig);
    setDetailOpportunity((prev) => prev ? { ...prev, scores, explanation, combinedScore } : null);
    setOpportunities((prev) => prev.map((o) => o.id === id ? { ...o, scores, explanation, combinedScore } : o));
    fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, scores, explanation }),
    });
  }, [dimConfig]);

  const opportunitiesByHorizon = useMemo(() => {
    const sorted = [...opportunities].sort((a, b) => b.combinedScore - a.combinedScore);
    return {
      now: sorted.filter((o) => o.horizon === "now"),
      next: sorted.filter((o) => o.horizon === "next"),
      later: sorted.filter((o) => o.horizon === "later"),
      unplanned: sorted.filter((o) => !o.horizon),
    };
  }, [opportunities]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Roadmap</h1>
        <Select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value);
            if (e.target.value) {
              router.push(`/roadmap?productId=${encodeURIComponent(e.target.value)}`);
            } else {
              router.push("/roadmap");
            }
          }}
          className="w-auto py-1.5"
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <p className="text-content-muted">Loading…</p>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-16 text-content-muted">
          <p className="text-base mb-1">No opportunities on the roadmap yet.</p>
          <p className="text-sm">Approve opportunities and assign a horizon (Now / Next / Later) to see them here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HorizonColumn title="Now" opportunities={opportunitiesByHorizon.now} onOpen={openDetail} />
            <HorizonColumn title="Next" opportunities={opportunitiesByHorizon.next} onOpen={openDetail} />
            <HorizonColumn title="Later" opportunities={opportunitiesByHorizon.later} onOpen={openDetail} />
          </div>
          {opportunitiesByHorizon.unplanned.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-medium text-gray-900 mb-3">Unplanned ({opportunitiesByHorizon.unplanned.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {opportunitiesByHorizon.unplanned.map((opp) => (
                  <OpportunityCard key={opp.id} opportunity={opp} onOpen={openDetail} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {detailOpportunity && (
        <OpportunityDetailPanel
          opportunity={detailOpportunity}
          dimensions={dimensions}
          products={products}
          onClose={() => setDetailOpportunity(null)}
          onUpdate={handleDetailUpdate}
          onUpdateScore={handleDetailUpdateScore}
        />
      )}
    </div>
  );
}

function HorizonColumn({ title, opportunities, onOpen }: { title: string; opportunities: Opportunity[]; onOpen: (o: Opportunity) => void }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-content">
        {title} ({opportunities.length})
      </h2>
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <p className="text-sm text-content-subtle">Nothing here yet</p>
        ) : (
          opportunities.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

function OpportunityCard({ opportunity, onOpen }: { opportunity: Opportunity; onOpen: (o: Opportunity) => void }) {
  return (
    <div
      onClick={() => onOpen(opportunity)}
      className="p-4 border border-border rounded-lg bg-surface hover:shadow-md hover:border-border-strong transition-all cursor-pointer"
    >
      <h3 className="font-medium text-content mb-1">{opportunity.title}</h3>
      {opportunity.productName && (
        <p className="text-xs text-content-muted mb-2">{opportunity.productName}</p>
      )}
      <div className="flex items-center justify-between text-xs text-content-muted">
        <span>{opportunity.feedbackCount} idea{opportunity.feedbackCount !== 1 ? "s" : ""}</span>
        {opportunity.combinedScore > 0 && <span className="font-medium">Score: {opportunity.combinedScore}</span>}
      </div>
      {opportunity.quarter && (
        <p className="text-xs text-content-subtle mt-2">{opportunity.quarter}</p>
      )}
    </div>
  );
}
