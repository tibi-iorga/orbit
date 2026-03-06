import React from "react";
import { cn } from "@/lib/cn";

// Predefined semantic variants for common app states
export type BadgeVariant =
  | "default"
  | "active"
  | "paused"
  | "done"
  | "not_on_roadmap"
  | "on_roadmap"
  | "archived"
  | "new"
  | "reviewed"
  | "rejected";

const variantClasses: Record<BadgeVariant, string> = {
  default:        "bg-surface-subtle  text-content-muted",
  active:         "bg-success-bg      text-success",
  paused:         "bg-warning-bg      text-warning",
  done:           "bg-surface-subtle  text-content-subtle",
  not_on_roadmap: "bg-surface-subtle  text-content-muted",
  on_roadmap:     "bg-blue-50         text-blue-700",
  archived:       "bg-surface-subtle  text-content-subtle",
  new:            "bg-blue-50         text-blue-700",
  reviewed:       "bg-success-bg      text-success",
  rejected:       "bg-surface-subtle  text-content-muted",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
