"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Opportunity } from "@/types";

export default function RoadmapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [productFilter, setProductFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) {
      setProductFilter(urlProductId);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (productFilter) params.set("productId", productFilter);
    const res = await fetch(`/api/opportunities?${params}`);
    if (!res.ok) {
      console.error("Failed to load opportunities");
      return;
    }
    const data = await res.json();
    setOpportunities(data);

    const prodRes = await fetch("/api/products");
    if (prodRes.ok) {
      const prodData = await prodRes.json();
      setProducts(prodData.flat || []);
    }
  }, [productFilter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const opportunitiesByHorizon = useMemo(() => {
    const now: Opportunity[] = [];
    const next: Opportunity[] = [];
    const later: Opportunity[] = [];
    const unplanned: Opportunity[] = [];

    const sorted = [...opportunities].sort((a, b) => b.combinedScore - a.combinedScore);

    for (const opp of sorted) {
      if (opp.horizon === "now") {
        now.push(opp);
      } else if (opp.horizon === "next") {
        next.push(opp);
      } else if (opp.horizon === "later") {
        later.push(opp);
      } else {
        unplanned.push(opp);
      }
    }

    return { now, next, later, unplanned };
  }, [opportunities]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-gray-900">Roadmap</h1>
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value);
            if (e.target.value) {
              router.push(`/roadmap?productId=${encodeURIComponent(e.target.value)}`);
            } else {
              router.push("/roadmap");
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
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HorizonColumn title="Now" opportunities={opportunitiesByHorizon.now} />
          <HorizonColumn title="Next" opportunities={opportunitiesByHorizon.next} />
          <HorizonColumn title="Later" opportunities={opportunitiesByHorizon.later} />
        </div>
      )}

      {opportunitiesByHorizon.unplanned.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">Unplanned</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {opportunitiesByHorizon.unplanned.map((opp) => (
              <OpportunityCard key={opp.id} opportunity={opp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HorizonColumn({ title, opportunities }: { title: string; opportunities: Opportunity[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-gray-900">
        {title} ({opportunities.length})
      </h2>
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <p className="text-sm text-gray-500">No opportunities</p>
        ) : (
          opportunities.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} />)
        )}
      </div>
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="p-4 border border-gray-200 rounded bg-white hover:shadow-md transition-shadow">
      <h3 className="font-medium text-gray-900 mb-1">{opportunity.title}</h3>
      {opportunity.productName && (
        <p className="text-xs text-gray-500 mb-2">{opportunity.productName}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{opportunity.feedbackCount} items</span>
        <span className="font-medium">Score: {opportunity.combinedScore}</span>
      </div>
      {opportunity.quarter && (
        <p className="text-xs text-gray-500 mt-2">{opportunity.quarter}</p>
      )}
    </div>
  );
}
