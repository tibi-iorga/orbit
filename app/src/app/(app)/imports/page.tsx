"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ImportRecord {
  id: string;
  filename: string;
  productId: string | null;
  productName: string | null;
  createdAt: string;
  featureCount: number;
  clusteredCount: number;
  unclusteredCount: number;
  scoredCount: number;
  unscoredCount: number;
}

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productFilter, setProductFilter] = useState<string>("");

  function load() {
    setError("");
    fetch("/api/imports")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load imports");
        return r.json();
      })
      .then(setImports)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load imports"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    const importRecord = imports.find((imp) => imp.id === id);
    if (!importRecord) return;
    const message = `Delete import "${importRecord.filename}"? This will permanently delete ${importRecord.featureCount} features.`;
    if (!confirm(message)) return;
    await fetch(`/api/imports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  const uniqueProducts = Array.from(
    new Map(
      imports.filter((imp) => imp.productId && imp.productName).map((imp) => [imp.productId, imp.productName])
    ).entries()
  ) as [string, string][];
  const filteredImports = productFilter
    ? imports.filter((imp) => imp.productId === productFilter)
    : imports;

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Imports</h1>
        <p className="text-sm text-gray-600 mt-1">
          View and manage all CSV imports. Delete an import to remove all its features.
        </p>
      </div>

      {uniqueProducts.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by product</label>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="">All products</option>
            {uniqueProducts.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filteredImports.length === 0 ? (
        <p className="text-sm text-gray-500">No imports found.</p>
      ) : (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Filename</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Product</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Features</th>
                <th className="px-4 py-3 text-left font-medium text-gray-900">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredImports.map((imp) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{imp.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{imp.productName || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{imp.featureCount}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="space-y-0.5">
                      <div>
                        {imp.clusteredCount > 0 && (
                          <span className="text-green-600">{imp.clusteredCount} clustered</span>
                        )}
                        {imp.clusteredCount > 0 && imp.unclusteredCount > 0 && " • "}
                        {imp.unclusteredCount > 0 && (
                          <span className="text-gray-500">{imp.unclusteredCount} unclustered</span>
                        )}
                      </div>
                      <div className="text-xs">
                        {imp.scoredCount > 0 && (
                          <span className="text-blue-600">{imp.scoredCount} scored</span>
                        )}
                        {imp.scoredCount > 0 && imp.unscoredCount > 0 && " • "}
                        {imp.unscoredCount > 0 && (
                          <span className="text-gray-400">{imp.unscoredCount} unscored</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(imp.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
