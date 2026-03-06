"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { invalidateFeedbackListCache } from "@/lib/cache";
import { Button, Select } from "@/components/ui";

interface ImportRecord {
  id: string;
  filename: string;
  productId: string | null;
  productName: string | null;
  createdAt: string;
  feedbackCount: number;
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
    const message = `Delete import "${importRecord.filename}"? This will permanently delete ${importRecord.feedbackCount} feedback items.`;
    if (!confirm(message)) return;
    await fetch(`/api/imports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    invalidateFeedbackListCache();
    window.dispatchEvent(new CustomEvent("feedback-imported"));
    load();
  }

  const uniqueProducts = Array.from(new Set(imports.map((imp) => imp.productName).filter(Boolean))) as string[];
  const filteredImports = productFilter
    ? imports.filter((imp) => imp.productName === productFilter)
    : imports;

  if (loading) return <p className="text-content-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Imports</h1>
        <p className="text-sm text-gray-600 mt-1">
          View and manage all imports. The Manual entry record groups feedback added individually and cannot be deleted.
        </p>
      </div>

      {uniqueProducts.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by product</label>
          <Select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">All products</option>
            {uniqueProducts.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </div>
      )}

      {filteredImports.length === 0 ? (
        <p className="text-sm text-content-muted">No imports found.</p>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-border ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-border-strong">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-content sm:pl-6">Filename</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content">Product</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content">Date</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content">Feedback items</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {filteredImports.map((imp) => (
                <tr key={imp.id} className="hover:bg-surface-muted">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-content sm:pl-6">
                    {imp.filename}
                    {imp.filename === "Manual entry" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-content-muted">
                        manual
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-content-muted">
                    {imp.productName || <span className="text-content-subtle">Unassigned</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-content-muted">
                    {new Date(imp.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-content-muted">{imp.feedbackCount}</td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    {imp.filename !== "Manual entry" ? (
                      <Button variant="danger" size="sm" type="button" onClick={() => remove(imp.id)}>
                        Delete
                      </Button>
                    ) : (
                      <span className="text-xs text-content-subtle">—</span>
                    )}
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
