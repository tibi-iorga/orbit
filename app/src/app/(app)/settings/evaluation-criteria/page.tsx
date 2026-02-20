"use client";

import { useEffect, useState } from "react";
import type { Dimension } from "@/types";

export default function EvaluationCriteriaPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/dimensions")
      .then((r) => r.json())
      .then(setDimensions)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, patch: Partial<Dimension>) {
    await fetch("/api/dimensions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  async function add() {
    await fetch("/api/dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New dimension",
        type: "yesno",
        weight: 1,
      }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this dimension? Scores for it will be lost.")) return;
    await fetch(`/api/dimensions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-gray-600">
          Edit scoring dimensions. Each has a name, type (yes/no or 1–3 scale), and weight. Changing weights rescores all items.
        </p>
      </div>
      <div className="space-y-4">
        {dimensions.map((d) => (
          <div
            key={d.id}
            className="p-4 border border-gray-200 rounded flex flex-wrap items-center gap-3"
          >
            <input
              value={d.name}
              onChange={(e) => update(d.id, { name: e.target.value })}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== d.name) update(d.id, { name: v });
              }}
              className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
            <select
              value={d.type}
              onChange={(e) => update(d.id, { type: e.target.value as "yesno" | "scale" })}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="yesno">Yes / No</option>
              <option value="scale">1 to 3 scale</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              Weight
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={d.weight}
                onChange={(e) => update(d.id, { weight: parseFloat(e.target.value) || 1 })}
                className="w-16 px-2 py-1 border border-gray-300 rounded"
              />
            </label>
            <button
              type="button"
              onClick={() => remove(d.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
        >
          Add dimension
        </button>
      </div>
    </div>
  );
}
