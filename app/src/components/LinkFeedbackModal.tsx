"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { FeedbackItem } from "@/types";

interface LinkFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (itemId: string) => void;
  productId: string | null;
}

export function LinkFeedbackModal({
  isOpen,
  onClose,
  onLink,
  productId,
}: LinkFeedbackModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [availableFeedback, setAvailableFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setAvailableFeedback([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("opportunityId", "__unassigned__");
        if (productId) {
          params.set("productId", productId);
        }
        fetch(`/api/feedback?${params}`)
          .then(async (r) => {
            if (r.ok) {
              const data = await r.json();
              const items = (data.feedbackItems || []).filter((item: FeedbackItem) =>
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
              );
              setAvailableFeedback(items);
            }
          })
          .finally(() => setLoading(false));
      } else {
        setAvailableFeedback([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, productId, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Link Feedback</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search unassigned feedback..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                autoFocus
              />
            </div>
            {loading ? (
              <p className="text-sm text-gray-500">Searching...</p>
            ) : availableFeedback.length === 0 && searchQuery.trim() ? (
              <p className="text-sm text-gray-500">No unassigned feedback found.</p>
            ) : availableFeedback.length > 0 ? (
              <ul className="space-y-2">
                {availableFeedback.map((item) => (
                  <li
                    key={item.id}
                    className="px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      onLink(item.id);
                      onClose();
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900">{item.title}</div>
                    {item.description && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Start typing to search for unassigned feedback...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
