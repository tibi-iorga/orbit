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
  scoredCount: number;
  unscoredCount: number;
}

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState<string>("");

  function load() {
    fetch("/api/imports")
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `Server returned ${r.status}`);
        }
        return r.json();
      })
      .then(setImports)
      .catch((error) => {
        console.error("Error loading imports:", error);
        setImports([]);
      })
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

  const uniqueProducts = Array.from(new Set(imports.map((imp) => imp.productName).filter(Boolean))) as string[];
  const filteredImports = productFilter
    ? imports.filter((imp) => imp.productName === productFilter)
    : imports;

  if (loading) return <p className="text-gray-500">Loading…</p>;

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
            {uniqueProducts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filteredImports.length === 0 ? (
        <p className="text-sm text-gray-500">No imports found.</p>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                  Filename
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Product
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Date
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Features
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Status
                </th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredImports.map((imp) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {imp.filename}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {imp.productName || <span className="text-gray-400">Unassigned</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {imp.featureCount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {imp.scoredCount > 0 && (
                      <span className="text-blue-600">{imp.scoredCount} scored</span>
                    )}
                    {imp.scoredCount > 0 && imp.unscoredCount > 0 && " • "}
                    {imp.unscoredCount > 0 && (
                      <span className="text-gray-400">{imp.unscoredCount} unscored</span>
                    )}
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                      type="button"
                      onClick={() => remove(imp.id)}
                      className="text-red-600 hover:text-red-900"
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
