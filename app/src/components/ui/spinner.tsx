import React from "react";
import { cn } from "@/lib/cn";

type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export function Spinner({ size = "sm", className, label = "Loading…" }: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-block rounded-full border-brand/20 border-t-brand animate-spin",
          sizeClasses[size],
        )}
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

// Centred full-width loading state — drop-in replacement for text "Loading…"
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-content-muted">
      <Spinner size="sm" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
