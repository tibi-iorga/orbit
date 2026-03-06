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
import { Button, Input, Textarea } from "@/components/ui";

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
      <div
        className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]"
        onClick={isLoading || isApplying ? undefined : onClose}
      />

      <div className="relative bg-surface rounded-xl shadow-2xl ring-1 ring-border w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* ── Step: Intro / Loading ─────────────────────────────────────────── */}
        {(step === "intro" || step === "loading") && (
          <>
            <div className="flex items-start justify-between px-6 pt-6 pb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-brand flex items-center justify-center">
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
                  <h2 className="text-base font-semibold text-content">Auto-group feedback</h2>
                  <p className="text-sm text-content-muted">AI-powered opportunity discovery</p>
                </div>
              </div>
              {!isLoading && (
                <Button variant="ghost" size="icon" onClick={onClose} className="mt-0.5">
                  <XMarkIcon className="h-5 w-5" />
                </Button>
              )}
            </div>

            <div className="px-6 pb-6 space-y-5 flex-shrink-0">
              <p className="text-sm text-content-muted leading-relaxed">
                AI will scan your <strong>new</strong> feedback and group similar requests into{" "}
                <strong>opportunities</strong> you can act on. Before anything is saved, you'll
                review each group — rename it, remove items, or discard it entirely.
              </p>

              <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 flex items-center gap-3">
                <div className="text-2xl font-bold text-content">
                  {selectedIds ? selectedIds.length : unassignedCount}
                </div>
                <div className="text-sm text-content-muted">
                  {selectedIds
                    ? `selected item${selectedIds.length === 1 ? "" : "s"} will be analysed`
                    : "new feedback items will be analysed"}
                </div>
              </div>

              <div className="space-y-2.5">
                {LOADING_STEPS.map((s, i) => {
                  const isDone = isLoading && i < loadingStep;
                  const isActive = isLoading && i === loadingStep;
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                          isDone
                            ? "bg-brand"
                            : isActive
                            ? "border-2 border-brand bg-surface"
                            : "border border-border-strong bg-surface"
                        }`}
                      >
                        {isDone ? (
                          <CheckIcon className="h-3 w-3 text-white" />
                        ) : isActive ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                        ) : (
                          <span className="text-xs text-content-subtle">{i + 1}</span>
                        )}
                      </div>
                      <span
                        className={`text-sm transition-colors duration-300 ${
                          isDone
                            ? "text-content-subtle line-through"
                            : isActive
                            ? "text-content font-medium"
                            : "text-content-muted"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {error && (
                <p className="text-sm text-danger bg-danger-bg rounded-lg px-3 py-2">{error}</p>
              )}

              {isLoading && (
                <p className="text-xs text-content-subtle">This may take a few seconds…</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 flex-shrink-0">
              <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
              <Button
                onClick={startAnalysis}
                loading={isLoading}
                disabled={isLoading || unassignedCount === 0}
              >
                <span>✦</span>
                Start analysis
              </Button>
            </div>
          </>
        )}

        {/* ── Step: Review ─────────────────────────────────────────────────── */}
        {(step === "review" || step === "applying") && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-content">Review opportunities</h2>
                <p className="text-sm text-content-muted mt-0.5">
                  {clusters.length} opportunities · {totalAssigned} of {totalFeedback} items assigned
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} disabled={isApplying} className="ml-4">
                <XMarkIcon className="h-5 w-5" />
              </Button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-border min-h-0">
              {clusters.length === 0 && (
                <p className="text-sm text-content-muted text-center py-12">
                  All opportunities removed. Add some back or cancel.
                </p>
              )}
              {clusters.map((cluster, i) => (
                <div key={i} className="px-6 py-3">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleExpand(i)}
                      className="mt-0.5 text-content-subtle hover:text-content-muted flex-shrink-0"
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
                          <Input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditingIndex(null);
                            }}
                            className="font-medium"
                          />
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={2}
                            placeholder="Description (optional)"
                            className="text-xs"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-content">{cluster.title}</span>
                            {cluster.productId && productMap.has(cluster.productId) && (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">
                                {productMap.get(cluster.productId)}
                              </span>
                            )}
                          </div>
                          {cluster.description && (
                            <p className="text-xs text-content-muted mt-0.5" title={cluster.description}>{cluster.description}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="flex-shrink-0 text-xs text-content-muted bg-surface-subtle rounded-full px-2 py-0.5 mt-0.5">
                      {cluster.feedbackItems.length}
                    </span>

                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {editingIndex === i ? (
                        <Button variant="ghost" size="icon" onClick={commitEdit} title="Save" className="text-success hover:text-success">
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => startEdit(i)} title="Rename" disabled={isApplying}>
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteCluster(i)} title="Discard opportunity" disabled={isApplying} className="hover:text-danger hover:bg-danger-bg">
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedIndices.has(i) && (
                    <ul className="mt-2 ml-6 divide-y divide-border border border-border rounded-md overflow-hidden">
                      {cluster.feedbackItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 group px-2 py-1.5 hover:bg-surface-muted">
                          <span className="text-xs text-content-muted" title={item.title}>{item.title}</span>
                          <button
                            onClick={() => removeFeedbackItem(i, item.id)}
                            className="flex-shrink-0 text-border-strong hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove from opportunity"
                            disabled={isApplying}
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                      {cluster.feedbackItems.length === 0 && (
                        <li className="text-xs text-content-subtle italic px-2 py-1.5">No feedback items</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-surface-muted rounded-b-xl">
              <div>
                {applyError ? (
                  <p className="text-xs text-danger">{applyError}</p>
                ) : (
                  <p className="text-xs text-content-muted">
                    Rename, remove items, or discard opportunities before saving.
                  </p>
                )}
              </div>
              <div className="flex gap-3 ml-4 flex-shrink-0">
                <Button variant="secondary" onClick={onClose} disabled={isApplying}>Cancel</Button>
                <Button
                  onClick={applyOpportunities}
                  loading={isApplying}
                  disabled={clusters.length === 0 || isApplying}
                >
                  {`Create ${clusters.length} ${clusters.length === 1 ? "opportunity" : "opportunities"}`}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step: Success ─────────────────────────────────────────────────── */}
        {step === "success" && (
          <div className="px-6 py-12 flex flex-col items-center gap-5 text-center flex-shrink-0">
            <div className="w-14 h-14 rounded-full bg-success-bg border border-success/20 flex items-center justify-center">
              <CheckIcon className="h-7 w-7 text-success" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-content">
                {createdCount} {createdCount === 1 ? "opportunity" : "opportunities"} created
              </h2>
              <p className="text-sm text-content-muted mt-1">
                Your feedback has been grouped and saved.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button onClick={() => { onClose(); router.push("/opportunities"); }}>
                View opportunities →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
