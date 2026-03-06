"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Input, Badge } from "@/components/ui";

interface OpportunityResult {
  id: string;
  title: string;
  description: string | null;
  productName: string | null;
  feedbackCount: number;
  status: string;
}

interface LinkOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (opportunityId: string) => void;
  /** IDs of opportunities already linked to this feedback item */
  linkedOpportunityIds: string[];
}

export function LinkOpportunityModal({
  isOpen,
  onClose,
  onLink,
  linkedOpportunityIds,
}: LinkOpportunityModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<OpportunityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search with AbortController
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = searchQuery.trim();
    if (trimmed.length > 0 && trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (trimmed) params.set("search", trimmed);
      fetch(`/api/opportunities?${params}`, { signal: controller.signal })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setResults(Array.isArray(data) ? data : []);
          }
        })
        .catch((e) => { if (e.name !== "AbortError") console.error(e); })
        .finally(() => setLoading(false));
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, isOpen]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]" />
      <div
        className="relative z-10 bg-surface rounded-xl shadow-2xl ring-1 ring-border max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-content">Link to Opportunity</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <Input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search opportunities by title or description…"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <p className="text-sm text-content-muted py-4">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-content-muted py-4">
              {searchQuery.trim() ? "No opportunities found." : "Start typing to search opportunities…"}
            </p>
          ) : (
            <ul className="space-y-2 mt-3">
              {results.map((opp) => {
                const alreadyLinked = linkedOpportunityIds.includes(opp.id);
                return (
                  <li
                    key={opp.id}
                    className={`px-3 py-2.5 border rounded-md transition-colors ${
                      alreadyLinked
                        ? "border-border bg-surface-muted opacity-60 cursor-not-allowed"
                        : "border-border hover:border-border-strong hover:bg-surface-muted cursor-pointer"
                    }`}
                    onClick={() => {
                      if (!alreadyLinked) {
                        onLink(opp.id);
                        onClose();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-content line-clamp-2">{opp.title}</div>
                        {opp.description && (
                          <div className="text-xs text-content-muted mt-0.5 line-clamp-2">{opp.description}</div>
                        )}
                        {opp.productName && (
                          <div className="text-xs text-content-subtle mt-1">{opp.productName}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {alreadyLinked && (
                          <span className="text-xs text-content-subtle whitespace-nowrap">Already linked</span>
                        )}
                        <span className="text-xs text-content-muted whitespace-nowrap">
                          {opp.feedbackCount} feedback
                        </span>
                        <Badge variant={opp.status as "not_on_roadmap" | "on_roadmap" | "archived"}>
                          {opp.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
