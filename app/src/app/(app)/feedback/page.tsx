"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { FeedbackDetailPanel } from "@/components/FeedbackDetailPanel";
import {
  getFeedbackListCacheKey,
  getCachedFeedbackList,
  setCachedFeedbackList,
  invalidateFeedbackListCache,
} from "@/lib/cache";
import type { FeedbackItem, FeedbackStatus } from "@/types";

const PAGE_SIZE = 25;

const STATUS_TABS: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "rejected", label: "Rejected" },
];

export default function FeedbackInboxPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; title: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; feedbackCount: number }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus>("new");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) {
      setSelectedProducts([urlProductId]);
    } else {
      setSelectedProducts([]);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    const cacheKey = getFeedbackListCacheKey({
      productIds: selectedProducts,
      status: statusFilter,
      page,
    });
    const cached = getCachedFeedbackList(cacheKey);
    if (cached) {
      setFeedbackItems((cached.feedbackItems ?? []) as FeedbackItem[]);
      setOpportunities(cached.opportunities ?? []);
      setProducts(cached.products ?? []);
      setTotalPages(cached.pagination?.totalPages ?? 1);
      setTotalCount(cached.pagination?.total ?? 0);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (selectedProducts.length > 0) {
      selectedProducts.forEach((id) => params.append("productId", id));
    }
    params.set("status", statusFilter);
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    const res = await fetch(`/api/feedback?${params}`);
    if (!res.ok) {
      console.error("Failed to load feedback items");
      return;
    }
    const data = await res.json();
    setFeedbackItems(data.feedbackItems ?? []);
    setOpportunities(data.opportunities ?? []);
    setProducts(data.products ?? []);
    setTotalPages(data.pagination?.totalPages ?? 1);
    setTotalCount(data.pagination?.total ?? 0);
    setCachedFeedbackList(cacheKey, {
      feedbackItems: data.feedbackItems ?? [],
      opportunities: data.opportunities ?? [],
      products: data.products ?? [],
      pagination: data.pagination ?? { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
    });
  }, [selectedProducts, statusFilter, page]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelectedItemIds(new Set());
  }, [selectedProducts, statusFilter]);

  const handleAssignOpportunity = async (itemId: string, opportunityId: string | null) => {
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, opportunityId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeedbackItems((prev) => prev.map((f) => f.id === updated.id ? { ...f, ...updated } : f));
      if (selectedItem?.id === updated.id) {
        setSelectedItem((prev) => prev ? { ...prev, ...updated } : null);
      }
      invalidateFeedbackListCache();
    }
  };

  const handleAssignProduct = async (itemId: string, productId: string | null) => {
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, productId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFeedbackItems((prev) => prev.map((f) => f.id === updated.id ? { ...f, ...updated } : f));
      if (selectedItem?.id === updated.id) {
        setSelectedItem((prev) => prev ? { ...prev, ...updated } : null);
      }
      invalidateFeedbackListCache();
    }
  };

  const handleStatusChange = async (itemId: string, status: FeedbackStatus) => {
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, status }),
    });
    if (res.ok) {
      const updated = await res.json();
      // Remove from current list if status no longer matches the filter
      if (updated.status !== statusFilter) {
        setFeedbackItems((prev) => prev.filter((f) => f.id !== itemId));
        setTotalCount((prev) => prev - 1);
        // Close detail panel after status change moves item out of view
        setSelectedItem(null);
      } else {
        setFeedbackItems((prev) => prev.map((f) => f.id === updated.id ? { ...f, ...updated } : f));
        if (selectedItem?.id === updated.id) {
          setSelectedItem((prev) => prev ? { ...prev, ...updated } : null);
        }
      }
      invalidateFeedbackListCache();
    }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedItemIds);
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "rejected" }),
    });
    if (res.ok) {
      setSelectedItemIds(new Set());
      setConfirmingBulkReject(false);
      invalidateFeedbackListCache();
      load();
    }
  };

  const handleBulkAssignOpportunity = async (opportunityId: string) => {
    const ids = Array.from(selectedItemIds);
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, opportunityId }),
    });
    if (res.ok) {
      setSelectedItemIds(new Set());
      setBulkAssigning(false);
      invalidateFeedbackListCache();
      load();
    }
  };

  const toggleProduct = useCallback((productId: string) => {
    setSelectedProducts((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  }, []);

  const clearFilters = () => {
    setSelectedProducts([]);
    router.push("/feedback");
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
    setConfirmingBulkReject(false);
    setBulkAssigning(false);
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Feedback Inbox ({totalCount})
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="relative w-64 cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <span className="block truncate">
                {selectedProducts.length === 0
                  ? "All products"
                  : selectedProducts.length === 1
                  ? products.find((p) => p.id === selectedProducts[0])?.name || "Selected"
                  : `${selectedProducts.length} products selected`}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </span>
            </button>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute z-20 mt-1 w-64 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="max-h-60 overflow-auto py-1">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes("__unassigned__")}
                        onChange={() => toggleProduct("__unassigned__")}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <span className="text-sm text-gray-900">Unassigned</span>
                    </label>
                    {products.map((product) => (
                      <label
                        key={product.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-900">
                          {product.name} ({product.feedbackCount})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={clearFilters}
            disabled={selectedProducts.length === 0}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-x-6">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                statusFilter === tab.value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : feedbackItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {statusFilter === "new"
              ? "No new feedback to review."
              : statusFilter === "reviewed"
              ? "No reviewed feedback items."
              : "No rejected feedback items."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 flex flex-col min-h-0 shadow ring-1 ring-black ring-opacity-5 md:rounded-lg overflow-hidden bg-white">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full divide-y divide-gray-300 table-fixed">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 w-12" />
                  <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-900 w-2/5">
                    Feedback
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-1/6">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-24">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    {statusFilter === "new" ? "Source" : "Opportunity"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {feedbackItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="py-4 pl-4 pr-3 sm:pl-6" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                    </td>
                    <td className="py-4 pr-3 text-sm font-medium text-gray-900 overflow-hidden">
                      <div className="truncate" title={item.title}>
                        {item.title}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {item.productName || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {statusFilter === "new"
                        ? (item.sourceName || <span className="text-gray-400">—</span>)
                        : (item.opportunityTitle || <span className="text-gray-400">—</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 bg-white py-4">
              <p className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectedItemIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-sm text-gray-700">
              {selectedItemIds.size} item{selectedItemIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-3 items-center">
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Clear
              </button>

              {/* Bulk assign to existing opportunity */}
              {bulkAssigning ? (
                <div className="flex items-center gap-2">
                  <select
                    autoFocus
                    onChange={(e) => {
                      if (e.target.value) handleBulkAssignOpportunity(e.target.value);
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>Select opportunity</option>
                    {opportunities.map((o) => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setBulkAssigning(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setBulkAssigning(true)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Bulk assign
                </button>
              )}

              {/* Bulk reject */}
              {confirmingBulkReject ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Reject {selectedItemIds.size} items?</span>
                  <button
                    onClick={() => setConfirmingBulkReject(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkReject}
                    className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingBulkReject(true)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Bulk reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <FeedbackDetailPanel
        selectedItem={selectedItem}
        opportunities={opportunities}
        products={products}
        onClose={() => setSelectedItem(null)}
        onAssignOpportunity={handleAssignOpportunity}
        onAssignProduct={handleAssignProduct}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
