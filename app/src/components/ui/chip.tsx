"use client";

import React from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/cn";

// Chip = interactive, removable tag. Badge = static label. Different purposes.

interface ChipProps {
  children: React.ReactNode;
  /** Called when the × button is clicked. Omit to render as non-removable. */
  onRemove?: () => void;
  /** Toggle-style: selected state */
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Chip({ children, onRemove, selected, onClick, disabled, className }: ChipProps) {
  const interactive = !!onClick || !!onRemove;
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); }
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
        selected
          ? "bg-brand text-white border-brand"
          : "bg-surface text-content-muted border-border-strong",
        interactive && !disabled && "cursor-pointer",
        !selected && interactive && !disabled && "hover:border-content-subtle hover:text-content",
        disabled && "opacity-40 cursor-not-allowed",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!disabled) onRemove(); }}
          disabled={disabled}
          className={cn(
            "-mr-0.5 rounded-full p-0.5 transition-colors",
            selected ? "hover:bg-white/20" : "hover:bg-surface-subtle",
          )}
          aria-label="Remove"
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
