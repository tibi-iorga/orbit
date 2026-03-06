"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Opportunity, Dimension } from "@/types";
import { computeCombinedScore, getMaxPossibleScore, NA_SCORE, type DimensionConfig } from "@/lib/score";
import { Button, Badge, Input, Textarea, Select } from "@/components/ui";

interface GoalOption {
  id: string;
  title: string;
  status: string;
}

interface IdeaItem {
  id: string;
  text: string;
}

interface SimilarOpportunity {
  id: string;
  title: string;
  feedbackCount: number;
  similarity: number;
}

interface OpportunityDetailPanelProps {
  opportunity: Opportunity | null;
  dimensions: Dimension[];
  products: { id: string; name: string }[];
  goals?: GoalOption[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Opportunity>) => void;
  onUpdateScore: (id: string, scores: Record<string, number>, explanation: Record<string, string>) => void;
  onMergeWith?: (otherId: string) => void;
}

function statusLabel(status: string): string {
  if (status === "on_roadmap") return "On Roadmap";
  if (status === "not_on_roadmap") return "Not on Roadmap";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function OpportunityDetailPanel({
  opportunity,
  dimensions,
  products,
  goals = [],
  onClose,
  onUpdate,
  onUpdateScore,
  onMergeWith,
}: OpportunityDetailPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [similarOpps, setSimilarOpps] = useState<SimilarOpportunity[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [productValue, setProductValue] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [showMoveToRoadmap, setShowMoveToRoadmap] = useState(false);
  const [moveHorizon, setMoveHorizon] = useState<"now" | "next" | "later">("now");
  const [moveWhen, setMoveWhen] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  useEffect(() => {
    if (opportunity) {
      setTimeout(() => setPanelOpen(true), 10);
      setTitleValue(opportunity.title);
      setDescriptionValue(opportunity.description || "");
      setProductValue(opportunity.productId || "");
      setGoalValue(opportunity.goalId || "");
      setShowArchiveConfirm(false);
      setSimilarOpps([]);
    } else {
      setPanelOpen(false);
    }
  }, [opportunity]);

  useEffect(() => {
    if (opportunity && panelOpen) {
      setLoadingIdeas(true);
      fetch(`/api/ideas?opportunityId=${opportunity.id}&limit=100`)
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setIdeas(data.ideas ?? []);
          }
        })
        .finally(() => setLoadingIdeas(false));

      setLoadingSimilar(true);
      fetch(`/api/opportunities/${opportunity.id}/similar`)
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setSimilarOpps(data.similar ?? []);
          }
        })
        .finally(() => setLoadingSimilar(false));
    }
  }, [opportunity?.id, panelOpen]);

  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      onClose();
      setEditingTitle(false);
      setEditingDescription(false);
      setShowMoveToRoadmap(false);
      setShowArchiveConfirm(false);
    }, 300);
  };

  const handleArchive = () => {
    if (!opportunity) return;
    onUpdate(opportunity.id, { status: "archived" });
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

  const handleRemoveFromRoadmap = () => {
    if (!opportunity) return;
    onUpdate(opportunity.id, { status: "not_on_roadmap", horizon: null, quarter: null });
  };

  if (!opportunity) return null;

  const dimConfig: DimensionConfig[] = dimensions.filter((d) => d.name.trim() !== "").map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    weight: d.weight,
    order: d.order,
    tag: d.tag,
    direction: d.direction,
  }));

  const combinedScore = computeCombinedScore(opportunity.scores, dimConfig);
  const maxScore = getMaxPossibleScore(opportunity.scores, dimConfig);

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
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Opportunity Details</h2>
            <Badge variant={opportunity.status as "not_on_roadmap" | "on_roadmap" | "archived"}>
              {statusLabel(opportunity.status)}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-white">

          {/* Title */}
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            {editingTitle ? (
              <Input
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
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") { setTitleValue(opportunity.title); setEditingTitle(false); }
                }}
                autoFocus
              />
            ) : (
              <p
                className="text-sm text-gray-900 cursor-text hover:bg-gray-50 p-1 rounded -ml-1"
                onClick={() => setEditingTitle(true)}
              >
                {opportunity.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            {editingDescription ? (
              <Textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                onBlur={() => {
                  onUpdate(opportunity.id, { description: descriptionValue.trim() || null });
                  setEditingDescription(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDescriptionValue(opportunity.description || "");
                    setEditingDescription(false);
                  }
                }}
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

          {/* Ideas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ideas ({ideas.length})
            </label>
            {loadingIdeas ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : ideas.length === 0 ? (
              <p className="text-sm text-gray-500">No ideas linked yet.</p>
            ) : (
              <ul className="space-y-1">
                {ideas.map((idea) => (
                  <li key={idea.id} className="flex gap-2 text-sm text-gray-800">
                    <span className="text-gray-400 flex-shrink-0 mt-px">·</span>
                    <span>{idea.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Scoring */}
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
                  {dimConfig.map((dim) => {
                    const isNA = opportunity.scores[dim.id] === NA_SCORE;
                    return (
                      <tr key={dim.id} className={`hover:bg-gray-50/50 ${isNA ? "opacity-40" : ""}`}>
                        <td className="px-3 py-2 text-sm text-gray-900">{dim.name}</td>
                        <td className="px-3 py-2">
                          <Select
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
                            className="py-1.5"
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
                            <option value={NA_SCORE}>N/A</option>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Combined score: {combinedScore} / {maxScore}
            </p>
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <Select
              value={productValue}
              onChange={(e) => {
                setProductValue(e.target.value);
                onUpdate(opportunity.id, { productId: e.target.value || null });
              }}
            >
              <option value="">No product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          {/* Goal */}
          {goals.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal</label>
              <Select
                value={goalValue}
                onChange={(e) => {
                  setGoalValue(e.target.value);
                  onUpdate(opportunity.id, { goalId: e.target.value || null });
                }}
              >
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}{g.status !== "active" ? ` (${g.status})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Similar opportunities */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Similar opportunities</label>
            {loadingSimilar ? (
              <p className="text-sm text-gray-400">Checking for similar…</p>
            ) : similarOpps.length === 0 ? (
              <p className="text-sm text-gray-400">No similar opportunities found.</p>
            ) : (
              <ul className="space-y-1.5">
                {similarOpps.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400">{s.feedbackCount} idea{s.feedbackCount !== 1 ? "s" : ""}</p>
                    </div>
                    {onMergeWith && (
                      <Button variant="secondary" size="sm" onClick={() => onMergeWith(s.id)}>
                        Merge
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
          {showArchiveConfirm ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-700">Archive this opportunity?</p>
              <Button variant="secondary" size="sm" onClick={handleArchive}>Confirm</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowArchiveConfirm(false)}>Cancel</Button>
            </div>
          ) : showMoveToRoadmap ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Add to roadmap</p>
              <div className="flex gap-2 flex-wrap items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Horizon</label>
                  <Select
                    value={moveHorizon}
                    onChange={(e) => setMoveHorizon(e.target.value as "now" | "next" | "later")}
                    className="w-auto py-1.5"
                  >
                    <option value="now">Now</option>
                    <option value="next">Next</option>
                    <option value="later">Later</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timeline (optional)</label>
                  <Input
                    type="text"
                    value={moveWhen}
                    onChange={(e) => setMoveWhen(e.target.value)}
                    placeholder="e.g. Q2 2025"
                    className="w-32 py-1.5"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleMoveToRoadmapConfirm}>Confirm</Button>
                <Button variant="secondary" onClick={() => setShowMoveToRoadmap(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {opportunity.status !== "on_roadmap" ? (
                <Button
                  onClick={() => {
                    setMoveHorizon(opportunity.horizon || "now");
                    setMoveWhen(opportunity.quarter || "");
                    setShowMoveToRoadmap(true);
                  }}
                >
                  Add to roadmap
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-green-50 text-green-700 rounded text-sm font-medium">
                    ✓ On roadmap{opportunity.quarter ? ` · ${opportunity.quarter}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMoveHorizon(opportunity.horizon || "now");
                      setMoveWhen(opportunity.quarter || "");
                      setShowMoveToRoadmap(true);
                    }}
                  >
                    Change
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRemoveFromRoadmap}>
                    Remove
                  </Button>
                </div>
              )}
              {opportunity.status !== "archived" && (
                <Button variant="secondary" onClick={() => setShowArchiveConfirm(true)}>Archive</Button>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
