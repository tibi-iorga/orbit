"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import { FeedbackDetailPanel } from "@/components/FeedbackDetailPanel";
import { AutoClusterReviewModal } from "@/components/AutoClusterReviewModal";
import { ImportModal } from "@/components/ImportModal";

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
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [newOpportunityTitle, setNewOpportunityTitle] = useState("");
  const [showAutoCluster, setShowAutoCluster] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState(""); // raw input value (debounced → searchQuery)
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const urlProductId = searchParams?.get("productId");
    if (urlProductId) {
      setSelectedProducts([urlProductId]);
    } else {
      setSelectedProducts([]);
    }
  }, [searchParams]);

  // Auto-open a specific item when ?item=<id> is in the URL
  useEffect(() => {
    const itemId = searchParams?.get("item");
    if (!itemId) return;
    fetch(`/api/feedback/${itemId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSelectedItem(data);
      })
      .catch(() => {});
  }, [searchParams]);

  const load = useCallback(async () => {
    // Search queries bypass the cache (results change with every keystroke)
    if (!searchQuery) {
      const cacheKey = getFeedbackListCacheKey({
        productIds: selectedProducts,
        status: statusFilter,
        page,
        sortDir,
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
    }

    // Cancel any previous in-flight search request
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const params = new URLSearchParams();
    if (selectedProducts.length > 0) {
      selectedProducts.forEach((id) => params.append("productId", id));
    }
    params.set("status", statusFilter);
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    params.set("sortDir", sortDir);
    if (searchQuery) params.set("search", searchQuery);

    try {
      const res = await fetch(`/api/feedback?${params}`, { signal: controller.signal });
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

      // Only cache non-search responses
      if (!searchQuery) {
        const cacheKey = getFeedbackListCacheKey({
          productIds: selectedProducts,
          status: statusFilter,
          page,
          sortDir,
        });
        setCachedFeedbackList(cacheKey, {
          feedbackItems: data.feedbackItems ?? [],
          opportunities: data.opportunities ?? [],
          products: data.products ?? [],
          pagination: data.pagination ?? { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
        });
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return; // cancelled — ignore
      console.error("Failed to load feedback items", e);
    }
  }, [selectedProducts, statusFilter, page, searchQuery, sortDir]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelectedItemIds(new Set());
  }, [selectedProducts, statusFilter, sortDir]);

  // Debounce raw search input (2-char minimum to use FTS)
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setSearchQuery("");
      return;
    }
    if (trimmed.length < 2) return; // wait for more chars — don't clear existing results
    const t = setTimeout(() => {
      setSearchQuery(trimmed);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reload when feedback is imported from the ImportModal
  useEffect(() => {
    const handler = () => {
      invalidateFeedbackListCache();
      load();
    };
    window.addEventListener("feedback-imported", handler);
    return () => window.removeEventListener("feedback-imported", handler);
  }, [load]);

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
    setSearchInput("");
    setSearchQuery("");
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
    setCreatingOpportunity(false);
    setNewOpportunityTitle("");
  };

  const handleCreateOpportunityFromSelection = async () => {
    if (!newOpportunityTitle.trim()) return;
    const ids = Array.from(selectedItemIds);
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newOpportunityTitle.trim(), feedbackItemIds: ids }),
    });
    if (res.ok) {
      clearSelection();
      invalidateFeedbackListCache();
      load();
    }
  };

  // Called by modal after opportunities are successfully created
  const handleAutoGroupSuccess = () => {
    window.dispatchEvent(new CustomEvent("feedback-imported"));
    invalidateFeedbackListCache();
    load();
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      {/* Row 1: Title + primary action buttons */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 whitespace-nowrap">
          Feedback Inbox ({totalCount})
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAutoCluster(true)}
            disabled={statusFilter !== "new"}
            title={statusFilter !== "new" ? "Only new feedback can be auto-grouped" : undefined}
            className="px-3 py-1.5 border border-gray-900 text-gray-900 rounded text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {selectedItemIds.size > 0 ? (
              <>✦ Auto-group {selectedItemIds.size} selected</>
            ) : (
              <>✦ Auto-group feedback</>
            )}
          </button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 flex items-center gap-1.5"
          >
            <PlusIcon className="h-4 w-4" />
            Add feedback
          </button>
        </div>
      </div>

      {/* Row 2: Status tabs (left) + search + product filter (right) */}
      <div className="flex items-end justify-between gap-3 border-b border-gray-200">
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
        <div className="flex items-center gap-2 pb-2">
          {/* Search box */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search feedback…"
              className="w-56 pl-8 pr-8 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Product filter dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="relative w-52 cursor-default rounded-md bg-white py-1.5 pl-3 pr-8 text-left text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <span className="block truncate">
                {selectedProducts.length === 0
                  ? "All products"
                  : selectedProducts.length === 1
                  ? products.find((p) => p.id === selectedProducts[0])?.name || "1 selected"
                  : `${selectedProducts.length} products selected`}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                {selectedProducts.length > 0 ? (
                  <button
                    type="button"
                    className="pointer-events-auto text-gray-400 hover:text-gray-700"
                    onClick={(e) => { e.stopPropagation(); setSelectedProducts([]); router.push("/feedback"); }}
                    title="Clear filter"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                )}
              </span>
            </button>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : feedbackItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery
              ? `No feedback matching "${searchQuery}".`
              : statusFilter === "new"
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
                  <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-900">
                    Feedback
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-1/6">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-28">
                    <button
                      onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
                      className="flex items-center gap-1 group"
                      title={sortDir === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
                    >
                      Date
                      <span className="text-gray-400 group-hover:text-gray-700">
                        {sortDir === "desc"
                          ? <ChevronDownIcon className="h-3.5 w-3.5" />
                          : <ChevronUpIcon className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-1/5">
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
                    <td className="py-3.5 pl-4 pr-3 sm:pl-6" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                    </td>
                    <td className="py-3 pr-3 text-sm overflow-hidden">
                      <div className="font-medium text-gray-900 truncate" title={item.title}>
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="text-gray-400 truncate text-xs mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
                      {item.productName || <span className="text-gray-400">—</span>}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-3 text-sm text-gray-500"
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 overflow-hidden">
                      {statusFilter === "new"
                        ? (item.sourceName
                            ? <span className="truncate block" title={item.sourceName}>{item.sourceName}</span>
                            : <span className="text-gray-400">—</span>)
                        : (item.opportunities.length > 0
                            ? <span className="truncate block" title={item.opportunities.map((o) => o.title).join(", ")}>{item.opportunities.map((o) => o.title).join(", ")}</span>
                            : <span className="text-gray-400">—</span>)}
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
            <div className="flex gap-3 items-center flex-wrap">
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Clear
              </button>

              {/* Create new opportunity from selection */}
              {creatingOpportunity ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newOpportunityTitle}
                    onChange={(e) => setNewOpportunityTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateOpportunityFromSelection();
                      if (e.key === "Escape") { setCreatingOpportunity(false); setNewOpportunityTitle(""); }
                    }}
                    placeholder="Opportunity name…"
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm w-56"
                  />
                  <button
                    onClick={handleCreateOpportunityFromSelection}
                    disabled={!newOpportunityTitle.trim()}
                    className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreatingOpportunity(false); setNewOpportunityTitle(""); }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setBulkAssigning(false); setConfirmingBulkReject(false); setCreatingOpportunity(true); }}
                  className="px-3 py-1.5 border border-gray-900 text-gray-900 rounded text-sm hover:bg-gray-50 font-medium"
                >
                  + New opportunity
                </button>
              )}

              {/* Bulk assign to existing opportunity */}
              {!creatingOpportunity && (bulkAssigning ? (
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
                  Assign to existing
                </button>
              ))}

              {/* Bulk reject */}
              {!creatingOpportunity && (confirmingBulkReject ? (
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
                  Reject
                </button>
              ))}
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

      <AutoClusterReviewModal
        isOpen={showAutoCluster}
        unassignedCount={totalCount}
        selectedIds={selectedItemIds.size > 0 ? Array.from(selectedItemIds) : undefined}
        onSuccess={handleAutoGroupSuccess}
        onClose={() => setShowAutoCluster(false)}
      />

      <ImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  );
}
