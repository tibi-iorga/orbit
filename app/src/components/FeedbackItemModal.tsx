"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { FeedbackItem } from "@/types";

interface FeedbackItemModalProps {
  item: FeedbackItem | null;
  onClose: () => void;
}

export function FeedbackItemModal({ item, onClose }: FeedbackItemModalProps) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const portalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    portalRef.current = document.body;
    setMounted(true);
  }, []);

  // Reset metaOpen when item changes
  useEffect(() => {
    setMetaOpen(false);
  }, [item?.id]);

  if (!item || !mounted) return null;

  const hasMetadata = item.metadata && Object.keys(item.metadata).length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Dark backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" />
      {/* Card — stopPropagation keeps clicks inside from closing the modal */}
      <div
        className="relative z-10 bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Feedback Details</h2>
          <div className="flex items-center gap-2">
            <a
              href={`/feedback?item=${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowTopRightOnSquareIcon className="h-5 w-5" />
            </a>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {item.description ? "Title" : "Feedback"}
            </label>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{item.title}</p>
          </div>
          {item.description && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
          {item.productName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <p className="text-sm text-gray-600">{item.productName}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <p className="text-sm text-gray-600">{new Date(item.createdAt).toLocaleString()}</p>
          </div>

          {hasMetadata && (
            <div className="border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setMetaOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 w-full text-left"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${metaOpen ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Original data
              </button>
              {metaOpen && (
                <dl className="mt-3 space-y-2">
                  {Object.entries(item.metadata!).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                      <dt className="text-gray-500 whitespace-nowrap">{key}</dt>
                      <dd className="text-gray-900 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
