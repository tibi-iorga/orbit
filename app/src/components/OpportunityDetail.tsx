"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Opportunity, Dimension, FeedbackItem } from "@/types";
import { FeedbackItemModal } from "./FeedbackItemModal";
import { LinkFeedbackModal } from "./LinkFeedbackModal";
import { computeCombinedScore, getMaxPossibleScore, type DimensionConfig } from "@/lib/score";

const STATUS_OPTIONS: { value: Opportunity["status"]; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "on_roadmap", label: "On Roadmap" },
  { value: "rejected", label: "Rejected" },
];

interface OpportunityDetailProps {
  opportunity: Opportunity;
  dimensions: Dimension[];
  products: { id: string; name: string }[];
  onUpdate: (updates: Partial<Opportunity>) => Promise<void>;
  onClose: () => void;
  onOpportunityChange?: (opportunity: Opportunity) => void;
}

export function OpportunityDetail({
  opportunity,
  dimensions,
  products,
  onUpdate,
  onClose,
  onOpportunityChange,
}: OpportunityDetailProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState(opportunity.title);
  const [descriptionValue, setDescriptionValue] = useState(opportunity.description || "");
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedFeedbackItem, setSelectedFeedbackItem] = useState<FeedbackItem | null>(null);
  const [editingExplanation, setEditingExplanation] = useState<string | null>(null);
  const [explanationValue, setExplanationValue] = useState("");
  const [pendingScoreUpdate, setPendingScoreUpdate] = useState<{ scores: Record<string, number>; explanation: Record<string, string> } | null>(null);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const feedbackSectionRef = useRef<HTMLDivElement>(null);

  const updateTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    setTitleValue(opportunity.title);
    setDescriptionValue(opportunity.description || "");
    setPendingScoreUpdate(null);
    if (onOpportunityChange) {
      onOpportunityChange(opportunity);
    }
  }, [opportunity, onOpportunityChange]);

  const loadFeedback = useCallback(async () => {
    if (feedbackLoaded) return;
    setLoadingFeedback(true);
    setFeedbackLoaded(true);
    const r = await fetch(`/api/feedback?opportunityId=${opportunity.id}`);
    if (r.ok) {
      const data = await r.json();
      setFeedbackItems(data.feedbackItems || []);
    }
    setLoadingFeedback(false);
  }, [opportunity.id, feedbackLoaded]);

  // Lazy load feedback when section comes into view
  useEffect(() => {
    if (feedbackLoaded || !feedbackSectionRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadFeedback();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(feedbackSectionRef.current);
    return () => observer.disconnect();
  }, [loadFeedback, feedbackLoaded]);

  const dimConfig: DimensionConfig[] = useMemo(
    () => dimensions.map((d) => ({ id: d.id, name: d.name, type: d.type, weight: d.weight, order: d.order, tag: d.tag })),
    [dimensions]
  );

  const dimensionsByTag = useMemo(() => {
    const grouped: Record<string, DimensionConfig[]> = {};
    for (const dim of dimConfig) {
      if (!grouped[dim.tag]) grouped[dim.tag] = [];
      grouped[dim.tag].push(dim);
    }
    return grouped;
  }, [dimConfig]);

  const debouncedUpdateScore = useCallback(
    (scores: Record<string, number>, explanation: Record<string, string>) => {
      setPendingScoreUpdate({ scores, explanation });
      const existing = updateTimeouts.current.get(opportunity.id);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(async () => {
        await onUpdate({ scores, explanation });
        setPendingScoreUpdate(null);
        updateTimeouts.current.delete(opportunity.id);
      }, 500);
      updateTimeouts.current.set(opportunity.id, timeout);
    },
    [opportunity.id, onUpdate]
  );

  const handleUnlinkFeedback = async (itemId: string) => {
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, opportunityId: null }),
    });
    await loadFeedback();
  };

  const handleLinkFeedback = async (itemId: string) => {
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, opportunityId: opportunity.id }),
    });
    await loadFeedback();
  };

  const displayScores = pendingScoreUpdate?.scores || opportunity.scores;
  const displayExplanation = pendingScoreUpdate?.explanation || opportunity.explanation;
  const combinedScore = computeCombinedScore(displayScores, dimConfig);
  const maxScore = getMaxPossibleScore(dimConfig);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center pt-[10vh] pb-10 px-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-y-auto">
          {/* Sticky close bar */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-end px-6 pt-4 pb-0">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 pb-6 space-y-6">
            {/* Title */}
            <div>
              {editingTitle ? (
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => {
                    if (titleValue.trim() && titleValue !== opportunity.title) {
                      onUpdate({ title: titleValue.trim() });
                    }
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    else if (e.key === "Escape") {
                      setTitleValue(opportunity.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-2xl font-semibold text-gray-900"
                  autoFocus
                />
              ) : (
                <h1
                  className="text-2xl font-semibold text-gray-900 cursor-text hover:bg-gray-50 px-2 py-1 rounded -mx-2"
                  onClick={() => setEditingTitle(true)}
                >
                  {opportunity.title}
                </h1>
              )}
            </div>

            {/* Properties table */}
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
              {/* Status */}
              <div className="flex items-center px-4 py-3">
                <span className="w-32 text-sm text-gray-500 shrink-0">Status</span>
                <select
                  value={opportunity.status}
                  onChange={(e) => onUpdate({ status: e.target.value as Opportunity["status"] })}
                  className="px-2 py-1 border border-gray-200 rounded text-sm text-gray-900 hover:border-gray-300 bg-transparent cursor-pointer"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product */}
              <div className="flex items-center px-4 py-3">
                <span className="w-32 text-sm text-gray-500 shrink-0">Product</span>
                <select
                  value={opportunity.productId || ""}
                  onChange={(e) => onUpdate({ productId: e.target.value || null })}
                  className="px-2 py-1 border border-gray-200 rounded text-sm text-gray-900 hover:border-gray-300 bg-transparent cursor-pointer"
                >
                  <option value="">No product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Roadmap */}
              <div className="flex items-center px-4 py-3">
                <span className="w-32 text-sm text-gray-500 shrink-0">Roadmap</span>
                <div className="flex gap-1.5">
                  {(["now", "next", "later"] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => onUpdate({ horizon: opportunity.horizon === h ? null : h })}
                      className={`px-3 py-1 rounded text-sm ${
                        opportunity.horizon === h
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {h.charAt(0).toUpperCase() + h.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quarter */}
              {opportunity.horizon && (
                <div className="flex items-center px-4 py-3">
                  <span className="w-32 text-sm text-gray-500 shrink-0">Quarter</span>
                  <input
                    type="text"
                    value={opportunity.quarter || ""}
                    onChange={(e) => onUpdate({ quarter: e.target.value || null })}
                    placeholder="e.g. Q2 2025"
                    className="px-2 py-1 border border-gray-200 rounded text-sm text-gray-900 hover:border-gray-300 bg-transparent"
                  />
                </div>
              )}

              {/* Score summary */}
              <div className="flex items-center px-4 py-3">
                <span className="w-32 text-sm text-gray-500 shrink-0">Score</span>
                <span className="text-sm font-medium text-gray-900">
                  {combinedScore} / {maxScore}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              {editingDescription ? (
                <textarea
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  onBlur={() => {
                    onUpdate({ description: descriptionValue.trim() || null });
                    setEditingDescription(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDescriptionValue(opportunity.description || "");
                      setEditingDescription(false);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  rows={3}
                  autoFocus
                />
              ) : (
                <div
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm text-gray-600 min-h-[4rem] cursor-text hover:border-gray-300"
                  onClick={() => setEditingDescription(true)}
                >
                  {opportunity.description || <span className="text-gray-400">Add a description...</span>}
                </div>
              )}
            </div>

            {/* Scoring */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Scoring</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimension</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Score</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Explanation</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(dimensionsByTag).flatMap(([tag, dims]) =>
                        dims.map((dim) => (
                          <tr key={dim.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{dim.name}</td>
                            <td className="px-4 py-3">
                              <select
                                value={displayScores[dim.id] ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value === "" ? undefined : Number(e.target.value);
                                  const newScores = { ...displayScores };
                                  if (value === undefined) {
                                    delete newScores[dim.id];
                                  } else {
                                    newScores[dim.id] = value;
                                  }
                                  const newExp = { ...displayExplanation, [dim.id]: displayExplanation[dim.id] || "" };
                                  debouncedUpdateScore(newScores, newExp);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
                              >
                                <option value="">—</option>
                                {dim.type === "yesno" ? (
                                  <>
                                    <option value="1">Yes</option>
                                    <option value="0">No</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                  </>
                                )}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {editingExplanation === dim.id ? (
                                <input
                                  type="text"
                                  value={explanationValue}
                                  onChange={(e) => setExplanationValue(e.target.value)}
                                  onBlur={() => {
                                    debouncedUpdateScore(displayScores, { ...displayExplanation, [dim.id]: explanationValue });
                                    setEditingExplanation(null);
                                    setExplanationValue("");
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    else if (e.key === "Escape") {
                                      setEditingExplanation(null);
                                      setExplanationValue("");
                                    }
                                  }}
                                  placeholder="Add explanation..."
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingExplanation(dim.id);
                                    setExplanationValue(displayExplanation[dim.id] || "");
                                  }}
                                  className="w-full text-left px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded border border-transparent hover:border-gray-200"
                                >
                                  {displayExplanation[dim.id] || <span className="text-gray-400">Add explanation...</span>}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Feedback Items */}
            <div ref={feedbackSectionRef}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Feedback ({feedbackLoaded ? feedbackItems.length : "?"})
                </label>
                <button
                  onClick={() => {
                    if (!feedbackLoaded) loadFeedback();
                    setShowLinkModal(true);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Link feedback
                </button>
              </div>
              {!feedbackLoaded ? (
                <p className="text-sm text-gray-400 py-3">Scroll down to load feedback...</p>
              ) : loadingFeedback ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : feedbackItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">No feedback linked yet.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {feedbackItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50">
                      <button
                        onClick={() => setSelectedFeedbackItem(item)}
                        className="flex-1 text-left text-sm text-gray-900 hover:underline truncate"
                        title={item.title}
                      >
                        {item.title}
                      </button>
                      <button
                        onClick={() => handleUnlinkFeedback(item.id)}
                        className="ml-3 opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:underline transition-opacity whitespace-nowrap"
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <LinkFeedbackModal
            isOpen={showLinkModal}
            onClose={() => setShowLinkModal(false)}
            onLink={handleLinkFeedback}
            productId={opportunity.productId}
          />

          <FeedbackItemModal item={selectedFeedbackItem} onClose={() => setSelectedFeedbackItem(null)} />
        </div>
      </div>
    </div>
  );
}
