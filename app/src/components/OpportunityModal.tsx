"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Opportunity } from "@/types";

interface OpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (opportunity: Opportunity) => void;
  products: { id: string; name: string }[];
  prelinkedFeedbackItems?: { id: string; title: string }[];
}

export function OpportunityModal({
  isOpen,
  onClose,
  onCreated,
  products,
  prelinkedFeedbackItems = [],
}: OpportunityModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      setProductId("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!productId) {
      setError("Product is required");
      return;
    }

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          productId: productId || null,
          feedbackItemIds: prelinkedFeedbackItems.map((item) => item.id),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create opportunity");
      }

      const newOpportunity = await res.json();

      // Fetch full opportunity with all fields
      const fullRes = await fetch(`/api/opportunities`);
      if (fullRes.ok) {
        const allOpportunities = await fullRes.json();
        const fullOpportunity = allOpportunities.find((o: Opportunity) => o.id === newOpportunity.id);
        if (fullOpportunity) {
          onCreated(fullOpportunity);
        } else {
          // Fallback: construct minimal opportunity with defaults
          onCreated({
            ...newOpportunity,
            status: "draft",
            scores: {},
            explanation: {},
            reportSummary: null,
            feedbackCount: 0,
            combinedScore: 0,
            productName: products.find((p) => p.id === newOpportunity.productId)?.name || null,
          });
        }
      } else {
        // Fallback: construct minimal opportunity with defaults
        onCreated({
          ...newOpportunity,
          status: "draft",
          scores: {},
          explanation: {},
          feedbackCount: 0,
          combinedScore: 0,
          productName: products.find((p) => p.id === newOpportunity.productId)?.name || null,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">New Opportunity</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                required
              >
                <option value="">Select a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Opportunity title"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="What is this opportunity?"
                rows={3}
              />
            </div>

            {prelinkedFeedbackItems.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Linked feedback
                </label>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {prelinkedFeedbackItems.map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create opportunity"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
