"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { FeedbackItem, FeedbackStatus } from "@/types";
import { Button, Badge } from "@/components/ui";

interface FeedbackDetailPanelProps {
  selectedItem: FeedbackItem | null;
  onClose: () => void;
  onStatusChange: (itemId: string, status: FeedbackStatus) => void;
}

function FeedbackInterpretation({ item }: { item: FeedbackItem }) {
  const { processingStatus, feedbackInsights, opportunities } = item;
  const chunks = feedbackInsights?.chunks ?? [];
  const hasRouting = opportunities.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-sm font-medium text-gray-900">How the system read this</p>

      {processingStatus === "not_processed" && (
        <p className="text-sm text-gray-500">Not yet processed — will be picked up automatically.</p>
      )}

      {processingStatus === "processing" && (
        <p className="text-sm text-gray-500">Reading this feedback now…</p>
      )}

      {processingStatus === "failed" && (
        <p className="text-sm text-red-600">Processing failed. Will retry on the next run.</p>
      )}

      {processingStatus === "processed" && (
        <>
          {chunks.length === 0 ? (
            <p className="text-sm text-gray-500">No ideas could be extracted from this feedback.</p>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-1.5">
                {chunks.length === 1 ? "One idea was found:" : `${chunks.length} distinct ideas were found:`}
              </p>
              <ul className="space-y-1">
                {chunks.map((text, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-800">
                    <span className="text-gray-400 flex-shrink-0">·</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasRouting ? (
            <div>
              <p className="text-sm text-gray-600 mb-1.5">Where it went:</p>
              <ul className="space-y-1">
                {opportunities.map((o) => (
                  <li key={o.id} className="flex gap-2 text-sm text-gray-800">
                    <span className="text-blue-400 flex-shrink-0">→</span>
                    <span>Linked to opportunity <span className="font-medium">"{o.title}"</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Not yet grouped into an opportunity — will be picked up automatically.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OriginalDataSection({ metadata }: { metadata: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 w-full text-left"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Original data
      </button>
      {open && (
        <dl className="mt-3 space-y-2">
          {Object.entries(metadata).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-gray-500 whitespace-nowrap">{key}</dt>
              <dd className="text-gray-900 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function FeedbackDetailPanel({
  selectedItem,
  onClose,
  onStatusChange,
}: FeedbackDetailPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);

  useEffect(() => {
    if (selectedItem) {
      setTimeout(() => setPanelOpen(true), 10);
    } else {
      setPanelOpen(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    setConfirmingReject(false);
  }, [selectedItem?.id]);

  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      onClose();
      setConfirmingReject(false);
    }, 300);
  };

  if (!selectedItem) return null;

  const isRejected = selectedItem.status === "rejected";

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        className={`fixed inset-0 bg-gray-900/50 transition-opacity duration-300 pointer-events-auto ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col pointer-events-auto ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Feedback Details</h2>
            {isRejected && <Badge variant="rejected">Rejected</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-white">
          {selectedItem.description ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <p className="text-sm text-gray-900">{selectedItem.title}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedItem.description}</p>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feedback</label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedItem.title}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <p className="text-sm text-gray-600">{new Date(selectedItem.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>

          <FeedbackInterpretation item={selectedItem} />

          {selectedItem.metadata && Object.keys(selectedItem.metadata).length > 0 && (
            <OriginalDataSection metadata={selectedItem.metadata} />
          )}
        </div>

        {/* Action footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
          {confirmingReject ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">Reject this feedback item?</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setConfirmingReject(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onStatusChange(selectedItem.id, "rejected");
                    setConfirmingReject(false);
                  }}
                >
                  Confirm reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {isRejected && (
                  <Button variant="ghost" size="sm" onClick={() => onStatusChange(selectedItem.id, "new")}>
                    Restore to inbox
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {!isRejected && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmingReject(true)}>
                    <XCircleIcon className="h-4 w-4" />
                    Mark as rejected
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
