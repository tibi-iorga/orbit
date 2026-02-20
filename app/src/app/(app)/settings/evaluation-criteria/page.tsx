"use client";

import { useEffect, useState } from "react";
import type { Dimension } from "@/types";
import { useDebounce } from "@/lib/useDebounce";

export default function EvaluationCriteriaPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/dimensions")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || `Server returned ${r.status}`);
        }
        return r.json();
      })
      .then(setDimensions)
      .catch((error) => {
        console.error("Error loading dimensions:", error);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(id: string, patch: Partial<Dimension>) {
    await fetch("/api/dimensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  const debouncedSave = useDebounce(save, 500);

  function updateLocal(id: string, patch: Partial<Dimension>) {
    setDimensions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }

  async function add() {
    await fetch("/api/dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        type: "scale",
        weight: 1,
        tag: "",
        direction: "benefit",
      }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this dimension? Scores for it will be lost.")) return;
    await fetch(`/api/dimensions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  // Compute total weight for relative % display
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Evaluation Criteria</h1>
        <p className="text-sm text-gray-600 mt-1">
          Define what matters to your team. Score each opportunity against these dimensions to surface the most important work.
        </p>
      </div>

      {dimensions.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm font-medium text-gray-900">No criteria yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Add dimensions that reflect your team&apos;s priorities — e.g. &ldquo;Carer impact&rdquo;, &ldquo;Dev complexity&rdquo;, &ldquo;Ops effort&rdquo;.
          </p>
          <button
            type="button"
            onClick={add}
            className="mt-4 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800"
          >
            Add your first dimension
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {dimensions.map((d) => {
            const pct = totalWeight > 0 ? Math.round((d.weight / totalWeight) * 100) : 0;
            return (
              <div
                key={d.id}
                className="p-4 border border-gray-200 rounded-lg space-y-3 bg-white"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    {/* Name */}
                    <input
                      value={d.name}
                      onChange={(e) => {
                        updateLocal(d.id, { name: e.target.value });
                        debouncedSave(d.id, { name: e.target.value });
                      }}
                      placeholder="Dimension name (e.g. Carer impact)"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    {/* Scoring hint */}
                    <input
                      value={d.tag}
                      onChange={(e) => {
                        updateLocal(d.id, { tag: e.target.value });
                        debouncedSave(d.id, { tag: e.target.value });
                      }}
                      placeholder="Scoring hint (e.g. 1 = affects few carers, 2 = moderate, 3 = affects all carers)"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    className="text-sm text-red-500 hover:text-red-700 whitespace-nowrap mt-1"
                  >
                    Remove
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  {/* Answer type */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Answer type</span>
                    <select
                      value={d.type}
                      onChange={(e) => {
                        const type = e.target.value as "yesno" | "scale";
                        updateLocal(d.id, { type });
                        save(d.id, { type });
                      }}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="scale">1 – 3 scale</option>
                      <option value="yesno">Yes / No</option>
                    </select>
                  </div>

                  {/* Direction */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Higher score is</span>
                    <select
                      value={d.direction}
                      onChange={(e) => {
                        const direction = e.target.value as "benefit" | "cost";
                        updateLocal(d.id, { direction });
                        save(d.id, { direction });
                      }}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="benefit">↑ Better</option>
                      <option value="cost">↓ Worse</option>
                    </select>
                  </div>

                  {/* Weight */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Importance</span>
                    <select
                      value={d.weight}
                      onChange={(e) => {
                        const weight = parseFloat(e.target.value);
                        updateLocal(d.id, { weight });
                        save(d.id, { weight });
                      }}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="1">Low</option>
                      <option value="2">Medium</option>
                      <option value="3">High</option>
                    </select>
                    <span className="text-xs text-gray-400">({pct}% of score)</span>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={add}
            className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            + Add dimension
          </button>
        </div>
      )}
    </div>
  );
}
