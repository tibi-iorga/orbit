"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon, CheckCircleIcon, XCircleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { FeedbackItem, FeedbackStatus } from "@/types";
import { LinkOpportunityModal } from "./LinkOpportunityModal";

interface FeedbackDetailPanelProps {
  selectedItem: FeedbackItem | null;
  opportunities: { id: string; title: string }[];
  products: { id: string; name: string; feedbackCount: number }[];
  onClose: () => void;
  onAssignOpportunity: (itemId: string, opportunityId: string | null) => void;
  onAssignProduct: (itemId: string, productId: string | null) => void;
  onStatusChange: (itemId: string, status: FeedbackStatus) => void;
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  switch (status) {
    case "new":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">New</span>;
    case "reviewed":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Reviewed</span>;
    case "rejected":
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Rejected</span>;
  }
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
  opportunities,
  products,
  onClose,
  onAssignOpportunity,
  onAssignProduct,
  onStatusChange,
}: FeedbackDetailPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [linkOppModalOpen, setLinkOppModalOpen] = useState(false);

  useEffect(() => {
    if (selectedItem) {
      setTimeout(() => setPanelOpen(true), 10);
    } else {
      setPanelOpen(false);
    }
  }, [selectedItem]);

  useEffect(() => {
    setConfirmingReject(false);
    setLinkOppModalOpen(false);
  }, [selectedItem?.id]);

  const handleClose = () => {
    setPanelOpen(false);
    setTimeout(() => {
      onClose();
      setConfirmingReject(false);
    }, 300);
  };

  if (!selectedItem) return null;

  const handleLinkOpportunity = (opportunityId: string) => {
    onAssignOpportunity(selectedItem.id, opportunityId);
    setLinkOppModalOpen(false);
  };

  const canMarkReviewed = selectedItem.status !== "reviewed" && selectedItem.opportunities.length > 0;
  const showMarkReviewed = selectedItem.status !== "reviewed";
  const canRestore = selectedItem.status === "rejected" || selectedItem.status === "reviewed";

  return (
    <>
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
            <StatusBadge status={selectedItem.status} />
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-500">
            <XMarkIcon className="h-6 w-6" />
          </button>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <select
              value={selectedItem.productId || ""}
              onChange={(e) => onAssignProduct(selectedItem.id, e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            >
              <option value="">Unassigned</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <p className="text-sm text-gray-600">{new Date(selectedItem.createdAt).toLocaleString()}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Opportunity</label>
              <button
                type="button"
                onClick={() => setLinkOppModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
              >
                <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                Search &amp; link
              </button>
            </div>
            {selectedItem.opportunities.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedItem.opportunities.map((o) => (
                  <span key={o.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{o.title}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No opportunity linked</p>
            )}
          </div>

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
                <button
                  onClick={() => setConfirmingReject(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onStatusChange(selectedItem.id, "rejected");
                    setConfirmingReject(false);
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Confirm reject
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {canRestore && (
                  <button
                    onClick={() => onStatusChange(selectedItem.id, "new")}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline"
                  >
                    Restore to inbox
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedItem.status !== "rejected" && (
                  <button
                    onClick={() => setConfirmingReject(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    Mark as rejected
                  </button>
                )}
                {showMarkReviewed && (
                  <span
                    className="inline-flex"
                    title={!canMarkReviewed ? "Please assign an opportunity first" : undefined}
                  >
                    <button
                      onClick={() => canMarkReviewed && onStatusChange(selectedItem.id, "reviewed")}
                      disabled={!canMarkReviewed}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      Mark as reviewed
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <LinkOpportunityModal
      isOpen={linkOppModalOpen}
      onClose={() => setLinkOppModalOpen(false)}
      onLink={handleLinkOpportunity}
      linkedOpportunityIds={selectedItem.opportunities.map((o) => o.id)}
    />
    </>
  );
}
