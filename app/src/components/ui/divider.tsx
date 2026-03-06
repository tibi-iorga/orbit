import React from "react";
import { cn } from "@/lib/cn";

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** Optional label rendered in the middle of a horizontal divider */
  label?: string;
  className?: string;
}

export function Divider({ orientation = "horizontal", label, className }: DividerProps) {
  if (orientation === "vertical") {
    return <div className={cn("self-stretch w-px bg-border", className)} aria-hidden="true" />;
  }

  if (label) {
    return (
      <div className={cn("flex items-center gap-3", className)} role="separator">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-content-subtle whitespace-nowrap">{label}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return <hr className={cn("border-0 border-t border-border", className)} aria-hidden="true" />;
}
