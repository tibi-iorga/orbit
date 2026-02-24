"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

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
      <div className="fixed inset-0 bg-black bg-opacity-50" />
      <div
        className="relative z-10 bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Link to Opportunity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search opportunities by title or description…"
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <p className="text-sm text-gray-500 py-4">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
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
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : "border-gray-200 hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
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
                        <div className="text-sm font-medium text-gray-900 line-clamp-2">{opp.title}</div>
                        {opp.description && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{opp.description}</div>
                        )}
                        {opp.productName && (
                          <div className="text-xs text-gray-400 mt-1">{opp.productName}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {alreadyLinked && (
                          <span className="text-xs text-gray-400 whitespace-nowrap">Already linked</span>
                        )}
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {opp.feedbackCount} feedback
                        </span>
                        <span className={`text-xs whitespace-nowrap px-1.5 py-0.5 rounded-full ${
                          opp.status === "on_roadmap"
                            ? "bg-green-100 text-green-700"
                            : opp.status === "approved"
                            ? "bg-blue-100 text-blue-700"
                            : opp.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {opp.status.replace("_", " ")}
                        </span>
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
