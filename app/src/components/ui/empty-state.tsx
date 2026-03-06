import React from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  message: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        "border border-dashed border-border rounded-lg",
        className,
      )}
    >
      <p className="text-sm font-medium text-content-muted">{message}</p>
      {description && <p className="mt-1 text-xs text-content-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
