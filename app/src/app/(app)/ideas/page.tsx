"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PlusIcon, XMarkIcon, InboxIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button, Textarea, Badge } from "@/components/ui";
import { invalidateOpportunitiesListCache } from "@/lib/cache";

interface Idea {
  id: string;
  text: string;
  source: "manual" | "ai_extracted";
  index: number;
  createdAt: string;
  feedbackItemId: string | null;
  feedbackItemTitle: string | null;
  feedbackItemStatus: string | null;
  productId: string | null;
  productName: string | null;
  opportunities: { id: string; title: string }[];
}

function IdeaStatusBadge({ idea }: { idea: Idea }) {
  if (idea.opportunities.length > 0) {
    return <Badge variant="active">Linked</Badge>;
  }
  return <Badge variant="default">Not linked</Badge>;
}

export default function IdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [grouping, setGrouping] = useState(false);

  useEffect(() => {
    if (selectedIdea) {
      setTimeout(() => setPanelOpen(true), 10);
    } else {
      setPanelOpen(false);
    }
  }, [selectedIdea]);

  const handlePanelClose = () => {
    setPanelOpen(false);
    setTimeout(() => setSelectedIdea(null), 300);
  };

  const limit = 50;

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`/api/ideas?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setIdeas(data.ideas ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleGroupIdeas = async () => {
    if (grouping) return;
    setGrouping(true);
    sessionStorage.setItem("grouping", "1");
    window.dispatchEvent(new CustomEvent("grouping-started"));
    try {
      await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "group" }),
      });
      invalidateOpportunitiesListCache();
      router.push("/opportunities");
    } finally {
      sessionStorage.removeItem("grouping");
      window.dispatchEvent(new CustomEvent("grouping-complete"));
      setGrouping(false);
    }
  };

  const handleCreateIdea = async () => {
    if (!newIdeaText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newIdeaText.trim() }),
      });
      if (!res.ok) return;
      const created: Idea = await res.json();
      setIdeas((prev) => [created, ...prev]);
      setTotal((t) => t + 1);
      setNewIdeaText("");
      setShowNewModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4 flex flex-col h-full relative">
      {/* Row 1: Title + action button */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-content whitespace-nowrap">Ideas ({total})</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleGroupIdeas} loading={grouping}>
            {!grouping && <ArrowPathIcon className="h-4 w-4" />}
            Group into opportunities
          </Button>
          <Button size="sm" onClick={() => setShowNewModal(true)}>
            <PlusIcon className="h-4 w-4" />
            New idea
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-content-muted">Loading…</p>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-content-muted">No ideas found.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 flex flex-col min-h-0 shadow ring-1 ring-border ring-opacity-5 md:rounded-lg overflow-hidden bg-surface">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full divide-y divide-border table-fixed">
                <thead className="bg-surface-muted sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 sm:pl-6 text-left text-sm font-semibold text-content whitespace-nowrap">
                      Idea
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content w-28 whitespace-nowrap">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-content w-32 whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {ideas.map((idea) => (
                    <tr
                      key={idea.id}
                      className={`hover:bg-surface-muted cursor-pointer ${selectedIdea?.id === idea.id ? "bg-surface-muted" : ""}`}
                      onClick={() => setSelectedIdea(idea)}
                    >
                      <td className="py-3 pl-4 pr-3 sm:pl-6 text-sm overflow-hidden">
                        <p className="text-content line-clamp-2">{idea.text}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-content-muted">
                        {new Date(idea.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <IdeaStatusBadge idea={idea} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 bg-surface py-4">
              <p className="text-sm text-content-muted">Page {page} of {totalPages}</p>
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

      {/* Slide-over detail panel */}
      {selectedIdea && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div
            className={`fixed inset-0 bg-gray-900/50 transition-opacity duration-300 pointer-events-auto ${panelOpen ? "opacity-100" : "opacity-0"}`}
            onClick={handlePanelClose}
          />
          <div
            className={`fixed inset-y-0 right-0 w-full max-w-lg bg-surface shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col pointer-events-auto ${panelOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-content">Idea Details</h2>
                <IdeaStatusBadge idea={selectedIdea} />
              </div>
              <Button variant="ghost" size="icon" onClick={handlePanelClose}>
                <XMarkIcon className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">Idea</label>
                <p className="text-sm text-content whitespace-pre-wrap">{selectedIdea.text}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">Date</label>
                <p className="text-sm text-content-muted">{new Date(selectedIdea.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">From</label>
                {selectedIdea.feedbackItemTitle ? (
                  <div className="flex items-start gap-2 text-sm text-content">
                    <InboxIcon className="w-4 h-4 mt-0.5 shrink-0 text-content-subtle" />
                    <span>{selectedIdea.feedbackItemTitle}</span>
                  </div>
                ) : (
                  <p className="text-sm text-content-subtle italic">Added manually</p>
                )}
              </div>

              {selectedIdea.opportunities.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">Linked to</label>
                  <div className="flex flex-wrap gap-1">
                    {selectedIdea.opportunities.map((o) => (
                      <span key={o.id} className="px-2 py-0.5 bg-surface-muted text-content-muted rounded text-xs">{o.title}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedIdea.productName && (
                <div>
                  <label className="block text-sm font-medium text-content-muted mb-1">Product</label>
                  <p className="text-sm text-content-muted">{selectedIdea.productName}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Idea Modal */}
      {showNewModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand/40 backdrop-blur-[1px]">
          <div className="bg-surface rounded-xl shadow-2xl ring-1 ring-border w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-content">New idea</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowNewModal(false)}>
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>
            <Textarea
              value={newIdeaText}
              onChange={(e) => setNewIdeaText(e.target.value)}
              placeholder="Describe the idea…"
              rows={4}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setShowNewModal(false)}>Cancel</Button>
              <Button onClick={handleCreateIdea} loading={submitting} disabled={submitting || !newIdeaText.trim()}>
                Create idea
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
