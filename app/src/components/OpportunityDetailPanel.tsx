"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Opportunity, Dimension, FeedbackItem } from "@/types";
import { FeedbackItemModal } from "./FeedbackItemModal";
import { LinkFeedbackModal } from "./LinkFeedbackModal";
import { computeCombinedScore, getMaxPossibleScore, type DimensionConfig } from "@/lib/score";

interface OpportunityDetailPanelProps {
  opportunity: Opportunity | null;
  dimensions: Dimension[];
  products: { id: string; name: string }[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Opportunity>) => void;
  onUpdateScore: (id: string, scores: Record<string, number>, explanation: Record<string, string>) => void;
}

function getStatusColor(status: Opportunity["status"]): string {
  switch (status) {
    case "draft":
      return "bg-gray-200 text-gray-700";
    case "under_review":
      return "bg-yellow-100 text-yellow-800";
    case "approved":
      return "bg-blue-100 text-blue-800";
    case "on_roadmap":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-200 text-gray-700";
  }
}

function getStatusLabel(status: Opportunity["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "under_review":
      return "Under Review";
    case "approved":
      return "Approved";
    case "on_roadmap":
      return "On Roadmap";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

export function OpportunityDetailPanel({
  opportunity,
  dimensions,
  products,
  onClose,
  onUpdate,
  onUpdateScore,
}: OpportunityDetailPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedFeedbackItem, setSelectedFeedbackItem] = useState<FeedbackItem | null>(null);
  const [productValue, setProductValue] = useState("");
  const [showMoveToRoadmap, setShowMoveToRoadmap] = useState(false);
  const [moveHorizon, setMoveHorizon] = useState<"now" | "next" | "later">("now");
  const [moveWhen, setMoveWhen] = useState("");

  useEffect(() => {
    if (opportunity) {
      setTimeout(() => setPanelOpen(true), 10);
      setTitleValue(opportunity.title);
      setDescriptionValue(opportunity.description || "");
      setProductValue(opportunity.productId || "");
      } else {
      setPanelOpen(false);
    }
  }, [opportunity]);

  useEffect(() => {
    if (opportunity && panelOpen) {
      setLoadingFeedback(true);
      fetch(`/api/feedback?opportunityId=${opportunity.id}`)
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setFeedbackItems(data.feedbackItems || []);
          }
        })
        .finally(() => setLoadingFeedback(false));
    }
  }, [opportunity, panelOpen]);


  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      onClose();
      setEditingTitle(false);
      setEditingDescription(false);
      setShowLinkModal(false);
      setSelectedFeedbackItem(null);
      setShowMoveToRoadmap(false);
    }, 300);
  };

  const handleArchive = () => {
    if (!opportunity) return;
    onUpdate(opportunity.id, { status: "rejected" });
    handleClose();
  };

  const handleMoveToRoadmapConfirm = () => {
    if (!opportunity) return;
    onUpdate(opportunity.id, {
      status: "on_roadmap",
      horizon: moveHorizon,
      quarter: moveWhen.trim() || null,
    });
    setShowMoveToRoadmap(false);
    setMoveWhen("");
  };

  const handleUnlinkFeedback = async (itemId: string) => {
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, opportunityId: null }),
    });
    setFeedbackItems((prev) => prev.filter((f) => f.id !== itemId));
  };

  const handleLinkFeedback = async (itemId: string) => {
    if (!opportunity) return;
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, opportunityId: opportunity.id }),
    });
    // Reload feedback items
    const res = await fetch(`/api/feedback?opportunityId=${opportunity.id}`);
    if (res.ok) {
      const data = await res.json();
      setFeedbackItems(data.feedbackItems || []);
    }
  };

  if (!opportunity) return null;

  const dimConfig: DimensionConfig[] = dimensions.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    weight: d.weight,
    order: d.order,
    tag: d.tag,
    direction: d.direction,
  }));

  const combinedScore = computeCombinedScore(opportunity.scores, dimConfig);
  const maxScore = getMaxPossibleScore(dimConfig);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-gray-900/50 transition-opacity duration-300 pointer-events-auto ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col pointer-events-auto ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Opportunity Details</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(opportunity.status)}`}>
              {getStatusLabel(opportunity.status)}
            </span>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-500">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-white">
          <div className="space-y-3">
            <div>
              {editingTitle ? (
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => {
                    if (titleValue.trim() && titleValue !== opportunity.title) {
                      onUpdate(opportunity.id, { title: titleValue.trim() });
                    }
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      setTitleValue(opportunity.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-medium"
                  autoFocus
                />
              ) : (
                <h3
                  className="text-lg font-medium text-gray-900 cursor-text hover:bg-gray-50 p-1 rounded -ml-1"
                  onClick={() => setEditingTitle(true)}
                >
                  {opportunity.title}
                </h3>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select
                value={productValue}
                onChange={(e) => {
                  setProductValue(e.target.value);
                  onUpdate(opportunity.id, { productId: e.target.value || null });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="">No product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
                  onUpdate(opportunity.id, {
                    description: descriptionValue.trim() || null,
                  });
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
              <p
                className="text-sm text-gray-600 cursor-text hover:bg-gray-50 p-1 rounded min-h-[1.5rem]"
                onClick={() => setEditingDescription(true)}
              >
                {opportunity.description || <span className="text-gray-400">Click to add description</span>}
              </p>
            )}
          </div>

          {/* Roadmap */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roadmap</label>
            <select
              value={opportunity.horizon ?? ""}
              onChange={(e) => {
                const v = e.target.value as "" | "now" | "next" | "later";
                onUpdate(opportunity.id, { horizon: v || null, quarter: v ? opportunity.quarter : null });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            >
              <option value="">Not on roadmap</option>
              <option value="now">Now</option>
              <option value="next">Next</option>
              <option value="later">Later</option>
            </select>
            {opportunity.horizon && (
              <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">When</label>
                <input
                  type="text"
                  value={opportunity.quarter || ""}
                  onChange={(e) => onUpdate(opportunity.id, { quarter: e.target.value || null })}
                  placeholder="e.g. Q2 2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            )}
          </div>

          {/* Scoring: one row per dimension with dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scoring</label>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dimension</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-36">Answer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {dimConfig.map((dim) => (
                    <tr key={dim.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-sm text-gray-900">{dim.name}</td>
                      <td className="px-3 py-2">
                        <select
                          value={opportunity.scores[dim.id] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const value = raw === "" ? undefined : Number(raw);
                            const newScores = { ...opportunity.scores };
                            if (value === undefined) {
                              delete newScores[dim.id];
                            } else {
                              newScores[dim.id] = value;
                            }
                            const newExplanation = { ...opportunity.explanation, [dim.id]: opportunity.explanation[dim.id] ?? "" };
                            onUpdateScore(opportunity.id, newScores, newExplanation);
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Combined score: {combinedScore} / {maxScore}
            </p>
          </div>

          {/* Feedback Items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feedback Items ({feedbackItems.length})
            </label>
            {loadingFeedback ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <>
                {feedbackItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No feedback items assigned to this opportunity.</p>
                ) : (
                  <ul className="space-y-2">
                    {feedbackItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between text-sm group border-b border-gray-100 pb-2 last:border-0">
                        <button
                          onClick={() => setSelectedFeedbackItem(item)}
                          className="flex-1 text-left text-gray-900 hover:text-gray-700 hover:underline truncate"
                          title={item.title}
                        >
                          {item.title}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnlinkFeedback(item.id);
                          }}
                          className="ml-2 opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:underline transition-opacity whitespace-nowrap"
                        >
                          Unlink
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0 space-y-3">
          {showMoveToRoadmap ? (
            <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm font-medium text-gray-700">Move to roadmap</p>
              <div className="flex gap-2 flex-wrap items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Now / Next / Later</label>
                  <select
                    value={moveHorizon}
                    onChange={(e) => setMoveHorizon(e.target.value as "now" | "next" | "later")}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="now">Now</option>
                    <option value="next">Next</option>
                    <option value="later">Later</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">When (optional)</label>
                  <input
                    type="text"
                    value={moveWhen}
                    onChange={(e) => setMoveWhen(e.target.value)}
                    placeholder="e.g. Q2 2025"
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm w-28"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMoveToRoadmap(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMoveToRoadmapConfirm}
                    className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2">
              {opportunity.status !== "rejected" && (
                <button
                  onClick={handleArchive}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                >
                  Archive
                </button>
              )}
              {opportunity.status !== "on_roadmap" && (
                <button
                  onClick={() => {
                    setMoveHorizon(opportunity.horizon || "now");
                    setMoveWhen(opportunity.quarter || "");
                    setShowMoveToRoadmap(true);
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                >
                  Move to Roadmap
                </button>
              )}
            </div>
            <button
              onClick={() => setShowLinkModal(true)}
              className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800"
            >
              Link feedback
            </button>
          </div>
        </div>
      </div>

      <LinkFeedbackModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onLink={handleLinkFeedback}
        productId={opportunity.productId}
      />

      <FeedbackItemModal
        item={selectedFeedbackItem}
        onClose={() => setSelectedFeedbackItem(null)}
      />
    </div>
  );
}
