"use client";

import React, { useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { Button } from "./button";

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  /** Rendered in the footer next to Cancel. Omit for non-form modals. */
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  /** Override footer entirely */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Modal({
  title,
  open,
  onClose,
  onSave,
  saving = false,
  saveLabel = "Save",
  footer,
  size = "md",
  className,
  children,
}: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, saving, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-brand/40 backdrop-blur-[1px]"
        onClick={saving ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          "relative bg-surface rounded-xl shadow-2xl w-full flex flex-col",
          "ring-1 ring-border",
          sizeClasses[size],
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 id="modal-title" className="text-sm font-semibold text-content">
            {title}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-content-subtle hover:text-content disabled:opacity-40 rounded p-0.5 -mr-0.5"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">{children}</div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          {footer ?? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              {onSave && (
                <Button variant="primary" onClick={onSave} loading={saving}>
                  {saving ? saveLabel + "…" : saveLabel}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
