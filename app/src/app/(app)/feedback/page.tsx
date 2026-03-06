"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import { FeedbackDetailPanel } from "@/components/FeedbackDetailPanel";
import { ImportModal } from "@/components/ImportModal";
import { Button, Badge } from "@/components/ui";

import {
  getFeedbackListCacheKey,
  getCachedFeedbackList,
  setCachedFeedbackList,
  invalidateFeedbackListCache,
} from "@/lib/cache";
import type { FeedbackItem, FeedbackStatus } from "@/types";

const PAGE_SIZE = 25;

type StatusTab = "active" | "rejected";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "active", label: "All" },
  { value: "rejected", label: "Rejected" },
];

export default function FeedbackInboxPage() {
  const searchParams = useSearchParams();
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusTab>("active");
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [confirmingBulkReject, setConfirmingBulkReject] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);
  const [processingRunLoading, setProcessingRunLoading] = useState(false);

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
    if (!searchQuery) {
      const cacheKey = getFeedbackListCacheKey({
        productIds: [],
        status: statusFilter,
        page,
        sortDir,
      });
      const cached = getCachedFeedbackList(cacheKey);
      if (cached) {
        setFeedbackItems((cached.feedbackItems ?? []) as FeedbackItem[]);
        setTotalPages(cached.pagination?.totalPages ?? 1);
        setTotalCount(cached.pagination?.total ?? 0);
        setLoading(false);
        return;
      }
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const params = new URLSearchParams();
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
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotalCount(data.pagination?.total ?? 0);

      if (!searchQuery) {
        const cacheKey = getFeedbackListCacheKey({
          productIds: [],
          status: statusFilter,
          page,
          sortDir,
        });
        setCachedFeedbackList(cacheKey, {
          feedbackItems: data.feedbackItems ?? [],
          pagination: data.pagination ?? { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
          opportunities: data.opportunities ?? [],
          products: data.products ?? [],
        });
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.error("Failed to load feedback items", e);
    }
  }, [statusFilter, page, searchQuery, sortDir]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelectedItemIds(new Set());
  }, [statusFilter, sortDir]);

  // Debounce raw search input (2-char minimum to use FTS)
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) {
      setSearchQuery("");
      return;
    }
    if (trimmed.length < 2) return;
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

  const handleStatusChange = async (itemId: string, status: FeedbackStatus) => {
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, status }),
    });
    if (res.ok) {
      const updated = await res.json();
      const itemMatchesFilter =
        statusFilter === "rejected" ? updated.status === "rejected" : updated.status !== "rejected";
      if (!itemMatchesFilter) {
        setFeedbackItems((prev) => prev.filter((f) => f.id !== itemId));
        setTotalCount((prev) => prev - 1);
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
  };

  function ProcessingBadge({ status }: { status: FeedbackItem["processingStatus"] }) {
    switch (status) {
      case "processed":
        return <Badge variant="reviewed">Processed</Badge>;
      case "processing":
        return <Badge variant="paused">Processing</Badge>;
      default:
        return <Badge variant="default">Not processed</Badge>;
    }
  }

  const hasNotProcessedItems = feedbackItems.some((item) => item.processingStatus === "not_processed");
  const hasProcessingItems = feedbackItems.some((item) => item.processingStatus === "processing");

  const triggerProcessingRun = useCallback(async () => {
    if (processingRunLoading) return;
    setProcessingRunLoading(true);
    try {
      const res = await fetch("/api/feedback/process/run", { method: "POST" });
      if (!res.ok) return;
      await load();
    } catch {
      // ignore
    } finally {
      setProcessingRunLoading(false);
    }
  }, [processingRunLoading, load]);

  useEffect(() => {
    if (!hasNotProcessedItems && !hasProcessingItems) return;
    const timer = setInterval(() => {
      triggerProcessingRun();
    }, 8000);
    return () => clearInterval(timer);
  }, [hasNotProcessedItems, hasProcessingItems, triggerProcessingRun]);

  return (
    <div className="space-y-4 flex flex-col h-full relative">
      {/* Row 1: Title + primary action buttons */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-content whitespace-nowrap">
          Feedback Inbox ({totalCount})
        </h1>
        <div className="flex items-center gap-2">
          {!loading && (
            <div className="flex items-center gap-1.5 text-sm text-content-muted">
              {hasProcessingItems || processingRunLoading ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
                  Processing feedback
                </>
              ) : hasNotProcessedItems ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-border-strong" />
                  Processing pending
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-success" />
                  All feedback processed
                </>
              )}
            </div>
          )}
          <Button size="sm" onClick={() => setImportModalOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Add feedback
          </Button>
        </div>
      </div>

      {/* Row 2: Status tabs (left) + search (right) */}
      <div className="flex items-end justify-between gap-3 border-b border-border">
        <nav className="-mb-px flex gap-x-6">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "border-content text-content"
                  : "border-transparent text-content-muted hover:border-border-strong hover:text-content"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-content-subtle pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search feedback…"
              className="w-56 pl-8 pr-8 py-1.5 border border-border rounded-md text-sm text-content bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-content-subtle hover:text-content-muted"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-content-muted">Loading...</p>
      ) : feedbackItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-content-muted">
            {searchQuery
              ? `No feedback matching "${searchQuery}".`
              : statusFilter === "rejected"
              ? "No rejected feedback items."
              : "No feedback items."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 flex flex-col min-h-0 shadow ring-1 ring-border ring-opacity-5 md:rounded-lg overflow-hidden bg-surface">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full divide-y divide-border table-fixed">
                <thead className="bg-surface-muted sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-content sm:pl-6 w-12" />
                    <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-content">
                      Feedback
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content w-28">
                      <button
                        onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
                        className="flex items-center gap-1 group"
                        title={sortDir === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
                      >
                        Date
                        <span className="text-content-subtle group-hover:text-content-muted">
                          {sortDir === "desc"
                            ? <ChevronDownIcon className="h-3.5 w-3.5" />
                            : <ChevronUpIcon className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content w-36">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content w-1/5">
                      Ideas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {feedbackItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-surface-muted cursor-pointer"
                      onClick={() => {
                        setSelectedItem(item);
                        fetch(`/api/feedback/${item.id}`)
                          .then((r) => (r.ok ? r.json() : null))
                          .then((data) => { if (data) setSelectedItem(data); })
                          .catch(() => {});
                      }}
                    >
                      <td className="py-3.5 pl-4 pr-3 sm:pl-6" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                      <td className="py-3 pr-3 text-sm overflow-hidden">
                        <div className="font-medium text-content truncate" title={item.title}>
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-content-subtle truncate text-xs mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-sm text-content-muted"
                        title={new Date(item.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      >
                        {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <ProcessingBadge status={item.processingStatus} />
                      </td>
                      <td className="px-3 py-3 text-sm text-content-muted overflow-hidden">
                        {item.ideas && item.ideas.length > 0
                          ? <span className="truncate block" title={item.ideas.join("; ")}>{item.ideas.length} created</span>
                          : <span className="text-content-subtle">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 bg-surface py-4">
              <p className="text-sm text-content-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectedItemIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-lg z-30 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-sm text-content-muted">
              {selectedItemIds.size} item{selectedItemIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-3 items-center">
              <button
                onClick={clearSelection}
                className="text-sm text-content-muted hover:text-content underline"
              >
                Clear
              </button>
              {confirmingBulkReject ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-danger">Reject {selectedItemIds.size} items?</span>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmingBulkReject(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleBulkReject}>
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setConfirmingBulkReject(true)}>
                  Reject
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <FeedbackDetailPanel
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onStatusChange={handleStatusChange}
      />

      <ImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  );
}
