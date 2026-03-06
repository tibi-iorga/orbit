"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { FeedbackItem } from "@/types";
import { Button, Input, Badge } from "@/components/ui";

interface LinkFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (itemId: string) => void;
  opportunityId: string | null;
  productId: string | null;
}

export function LinkFeedbackModal({
  isOpen,
  onClose,
  onLink,
  opportunityId,
  productId,
}: LinkFeedbackModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<FeedbackItem[]>([]);
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

  // Debounced search with AbortController — cancels in-flight request on new keystroke
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = searchQuery.trim();
    // Require at least 2 chars to fire; clear results for shorter queries
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
      if (productId) params.set("productId", productId);
      params.set("pageSize", "50");
      fetch(`/api/feedback?${params}`, { signal: controller.signal })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setResults(data.feedbackItems || []);
          }
        })
        .catch((e) => { if (e.name !== "AbortError") console.error(e); })
        .finally(() => setLoading(false));
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, productId, isOpen]);

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
          <h2 className="text-sm font-semibold text-content">Link Feedback</h2>
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
            placeholder="Search feedback by title or description…"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <p className="text-sm text-content-muted py-4">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-content-muted py-4">
              {searchQuery.trim() ? "No feedback found." : "Start typing to search feedback…"}
            </p>
          ) : (
            <ul className="space-y-2 mt-3">
              {results.map((item) => {
                const alreadyLinked = opportunityId
                  ? item.opportunities.some((o) => o.id === opportunityId)
                  : false;
                return (
                  <li
                    key={item.id}
                    className={`px-3 py-2.5 border rounded-md transition-colors ${
                      alreadyLinked
                        ? "border-border bg-surface-muted opacity-60 cursor-not-allowed"
                        : "border-border hover:border-border-strong hover:bg-surface-muted cursor-pointer"
                    }`}
                    onClick={() => {
                      if (!alreadyLinked) {
                        onLink(item.id);
                        onClose();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-content line-clamp-2">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-content-muted mt-0.5 line-clamp-2">{item.description}</div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {item.productName && (
                            <span className="text-xs text-content-subtle">{item.productName}</span>
                          )}
                          {item.productName && item.sourceName && (
                            <span className="text-xs text-border-strong">·</span>
                          )}
                          {item.sourceName && (
                            <span className="text-xs text-content-subtle">{item.sourceName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {alreadyLinked && (
                          <span className="text-xs text-content-subtle whitespace-nowrap">Already linked</span>
                        )}
                        {item.opportunities.length > 0 && !alreadyLinked && (
                          <span className="text-xs text-blue-600 whitespace-nowrap">
                            {item.opportunities.length} opportunit{item.opportunities.length === 1 ? "y" : "ies"}
                          </span>
                        )}
                        <Badge variant={item.status as "new" | "reviewed" | "rejected"}>{item.status}</Badge>
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
