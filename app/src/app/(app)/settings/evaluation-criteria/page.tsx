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
        name: "New dimension",
        type: "yesno",
        weight: 1,
        tag: "General",
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
        <h1 className="text-xl font-semibold text-gray-900">Evaluation Criteria</h1>
        <p className="text-sm text-gray-600 mt-1">
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
              onChange={(e) => {
                updateLocal(d.id, { name: e.target.value });
                debouncedSave(d.id, { name: e.target.value });
              }}
              className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-300 rounded text-sm"
            />
            <select
              value={d.type}
              onChange={(e) => {
                const type = e.target.value as "yesno" | "scale";
                updateLocal(d.id, { type });
                save(d.id, { type });
              }}
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
                onChange={(e) => {
                  const weight = parseFloat(e.target.value) || 1;
                  updateLocal(d.id, { weight });
                  debouncedSave(d.id, { weight });
                }}
                className="w-16 px-2 py-1 border border-gray-300 rounded"
              />
            </label>
            <select
              value={d.tag}
              onChange={(e) => {
                updateLocal(d.id, { tag: e.target.value });
                save(d.id, { tag: e.target.value });
              }}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="General">General</option>
              <option value="Medical">Medical</option>
              <option value="Ops">Ops</option>
              <option value="Engineering">Engineering</option>
              <option value="Bids">Bids</option>
            </select>
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
