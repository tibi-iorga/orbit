"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

export interface PreviewCluster {
  title: string;
  description: string;
  productId?: string | null;
  feedbackItems: { id: string; title: string }[];
}

interface Product {
  id: string;
  name: string;
}

interface AutoClusterReviewModalProps {
  isOpen: boolean;
  unassignedCount: number; // count of new/unassigned feedback items
  selectedIds?: string[]; // if provided, only analyse these items
  onSuccess: () => void;  // called after opportunities are created (cache invalidate + reload)
  onClose: () => void;
}

type Step = "intro" | "loading" | "review" | "applying" | "success";

const LOADING_STEPS = [
  { key: "gather", label: "Gathering feedback" },
  { key: "send", label: "Sending for analysis" },
  { key: "generate", label: "Generating opportunities" },
];

export function AutoClusterReviewModal({
  isOpen,
  unassignedCount,
  selectedIds,
  onSuccess,
  onClose,
}: AutoClusterReviewModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [loadingStep, setLoadingStep] = useState(0); // 0, 1, 2
  const [clusters, setClusters] = useState<PreviewCluster[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Reset when modal opens; also fetch product list for badges
  useEffect(() => {
    if (isOpen) {
      setStep("intro");
      setLoadingStep(0);
      setClusters([]);
      setTotalFeedback(0);
      setCreatedCount(0);
      setError(null);
      setApplyError(null);
      setExpandedIndices(new Set());
      setEditingIndex(null);

      // Fetch products for badge display (fire and forget)
      fetch("/api/products")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.flat) setProducts(data.flat as Product[]);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalAssigned = new Set(clusters.flatMap((c) => c.feedbackItems.map((f) => f.id))).size;
  const productMap = new Map(products.map((p) => [p.id, p.name]));

  // ── Loading / analysis ────────────────────────────────────────────────────

  async function startAnalysis() {
    setStep("loading");
    setLoadingStep(0);
    setError(null);

    const t1 = setTimeout(() => setLoadingStep(1), 600);
    const t2 = setTimeout(() => setLoadingStep(2), 1400);

    try {
      const res = await fetch("/api/opportunities/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedIds ? { ids: selectedIds } : {}),
      });
      const data = await res.json();
      clearTimeout(t1);
      clearTimeout(t2);
      if (!res.ok) {
        setError(data.error || "Analysis failed. Please try again.");
        setStep("intro");
        return;
      }
      setLoadingStep(2);
      await new Promise((r) => setTimeout(r, 600));
      setClusters(data.clusters ?? []);
      setTotalFeedback(data.totalFeedback ?? 0);
      setStep("review");
    } catch {
      clearTimeout(t1);
      clearTimeout(t2);
      setError("Something went wrong. Please try again.");
      setStep("intro");
    }
  }

  // ── Apply / create ────────────────────────────────────────────────────────

  async function applyOpportunities() {
    setStep("applying");
    setApplyError(null);
    try {
      const res = await fetch("/api/opportunities/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusters }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyError(data.error || "Failed to create opportunities.");
        setStep("review");
        return;
      }
      setCreatedCount(data.created ?? clusters.length);
      setStep("success");
      onSuccess(); // trigger cache invalidation + reload on parent
    } catch {
      setApplyError("Something went wrong. Please try again.");
      setStep("review");
    }
  }

  // ── Cluster editing ───────────────────────────────────────────────────────

  const toggleExpand = (i: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditTitle(clusters[i].title);
    setEditDescription(clusters[i].description);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    setClusters((prev) =>
      prev.map((c, i) =>
        i === editingIndex
          ? { ...c, title: editTitle.trim() || c.title, description: editDescription.trim() }
          : c
      )
    );
    setEditingIndex(null);
  };

  const deleteCluster = (i: number) => {
    setClusters((prev) => prev.filter((_, idx) => idx !== i));
    setExpandedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((idx) => {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      });
      return next;
    });
    if (editingIndex === i) setEditingIndex(null);
  };

  const removeFeedbackItem = (clusterIndex: number, feedbackId: string) => {
    setClusters((prev) =>
      prev.map((c, i) =>
        i === clusterIndex
          ? { ...c, feedbackItems: c.feedbackItems.filter((f) => f.id !== feedbackId) }
          : c
      )
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = step === "loading";
  const isApplying = step === "applying";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={isLoading || isApplying ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* ── Step: Intro / Loading ─────────────────────────────────────────── */}
        {(step === "intro" || step === "loading") && (
          <>
            <div className="flex items-start justify-between px-6 pt-6 pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center">
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <span className="text-white text-base">✦</span>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Auto-group feedback</h2>
                  <p className="text-sm text-gray-500">AI-powered opportunity discovery</p>
                </div>
              </div>
              {!isLoading && (
                <button onClick={onClose} className="text-gray-400 hover:text-gray-500 mt-0.5">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="px-6 pb-6 space-y-5 flex-shrink-0">
              <p className="text-sm text-gray-600 leading-relaxed">
                AI will scan your <strong>new</strong> feedback and group similar requests into{" "}
                <strong>opportunities</strong> you can act on. Before anything is saved, you'll
                review each group — rename it, remove items, or discard it entirely.
              </p>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-900">
                  {selectedIds ? selectedIds.length : unassignedCount}
                </div>
                <div className="text-sm text-gray-600">
                  {selectedIds
                    ? `selected item${selectedIds.length === 1 ? "" : "s"} will be analysed`
                    : "new feedback items will be analysed"}
                </div>
              </div>

              {/* Steps — static when idle, animated when loading */}
              <div className="space-y-2.5">
                {LOADING_STEPS.map((s, i) => {
                  const isDone = isLoading && i < loadingStep;
                  const isActive = isLoading && i === loadingStep;
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                          isDone
                            ? "bg-gray-900"
                            : isActive
                            ? "border-2 border-gray-900 bg-white"
                            : "border border-gray-300 bg-white"
                        }`}
                      >
                        {isDone ? (
                          <CheckIcon className="h-3 w-3 text-white" />
                        ) : isActive ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-900 animate-pulse" />
                        ) : (
                          <span className="text-xs text-gray-400">{i + 1}</span>
                        )}
                      </div>
                      <span
                        className={`text-sm transition-colors duration-300 ${
                          isDone
                            ? "text-gray-400 line-through"
                            : isActive
                            ? "text-gray-900 font-medium"
                            : "text-gray-500"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              {isLoading && (
                <p className="text-xs text-gray-400">This may take a few seconds…</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={startAnalysis}
                disabled={isLoading || unassignedCount === 0}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Analysing…
                  </>
                ) : (
                  <>
                    <span>✦</span>
                    Start analysis
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step: Review ─────────────────────────────────────────────────── */}
        {(step === "review" || step === "applying") && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Review opportunities</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {clusters.length} opportunities · {totalAssigned} of {totalFeedback} items assigned
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={isApplying}
                className="text-gray-400 hover:text-gray-500 ml-4 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Cluster list — scrollable */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100 min-h-0">
              {clusters.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12">
                  All opportunities removed. Add some back or cancel.
                </p>
              )}
              {clusters.map((cluster, i) => (
                <div key={i} className="px-6 py-3">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleExpand(i)}
                      className="mt-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      {expandedIndices.has(i) ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {editingIndex === i ? (
                        <div className="space-y-1.5">
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditingIndex(null);
                            }}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-600"
                            placeholder="Description (optional)"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{cluster.title}</span>
                            {cluster.productId && productMap.has(cluster.productId) && (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">
                                {productMap.get(cluster.productId)}
                              </span>
                            )}
                          </div>
                          {cluster.description && (
                            <p className="text-xs text-gray-500 mt-0.5" title={cluster.description}>{cluster.description}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
                      {cluster.feedbackItems.length}
                    </span>

                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {editingIndex === i ? (
                        <button onClick={commitEdit} className="p-1 text-green-600 hover:text-green-700" title="Save">
                          <CheckIcon className="h-4 w-4" />
                        </button>
                      ) : (
                        <button onClick={() => startEdit(i)} className="p-1 text-gray-400 hover:text-gray-600" title="Rename" disabled={isApplying}>
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => deleteCluster(i)} className="p-1 text-gray-400 hover:text-red-500" title="Discard opportunity" disabled={isApplying}>
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {expandedIndices.has(i) && (
                    <ul className="mt-2 ml-6 divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
                      {cluster.feedbackItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 group px-2 py-1.5 hover:bg-gray-50">
                          <span className="text-xs text-gray-600" title={item.title}>{item.title}</span>
                          <button
                            onClick={() => removeFeedbackItem(i, item.id)}
                            className="flex-shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove from opportunity"
                            disabled={isApplying}
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                      {cluster.feedbackItems.length === 0 && (
                        <li className="text-xs text-gray-400 italic px-2 py-1.5">No feedback items</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {/* Footer — always visible */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0 bg-gray-50 rounded-b-xl">
              <div>
                {applyError ? (
                  <p className="text-xs text-red-600">{applyError}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Rename, remove items, or discard opportunities before saving.
                  </p>
                )}
              </div>
              <div className="flex gap-3 ml-4 flex-shrink-0">
                <button
                  onClick={onClose}
                  disabled={isApplying}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={applyOpportunities}
                  disabled={clusters.length === 0 || isApplying}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isApplying ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Saving…
                    </>
                  ) : (
                    `Create ${clusters.length} ${clusters.length === 1 ? "opportunity" : "opportunities"}`
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step: Success ─────────────────────────────────────────────────── */}
        {step === "success" && (
          <div className="px-6 py-12 flex flex-col items-center gap-5 text-center flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
              <CheckIcon className="h-7 w-7 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {createdCount} {createdCount === 1 ? "opportunity" : "opportunities"} created
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Your feedback has been grouped and saved.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  router.push("/opportunities");
                }}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                View opportunities →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
