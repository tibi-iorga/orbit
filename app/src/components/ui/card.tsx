import React from "react";
import { cn } from "@/lib/cn";
import { Text } from "./text";

// ─── Card ─────────────────────────────────────────────────────────────────────

type CardVariant = "default" | "flat" | "inset";
type CardPadding = "none" | "sm" | "md" | "lg";

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-6",
};

const variantClasses: Record<CardVariant, string> = {
  default: "bg-surface border border-border rounded-xl",
  flat:    "bg-surface-muted rounded-xl",
  inset:   "bg-surface-subtle border border-border rounded-lg",
};

interface CardProps {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Adds hover:border-border-strong + group class for child hover targets */
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Card({
  variant = "default",
  padding = "none",
  hover,
  className,
  children,
}: CardProps) {
  return (
    <div
      className={cn(
        variantClasses[variant],
        paddingClasses[padding],
        hover && "hover:border-border-strong transition-colors group cursor-default",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── CardHeader ───────────────────────────────────────────────────────────────
// Standard pattern: title + optional description on the left, optional action on the right.

interface CardHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Element(s) placed on the right — typically a Button */
  action?: React.ReactNode;
  /** Extra padding + bottom border for section-level headers */
  bordered?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function CardHeader({
  title,
  description,
  action,
  bordered,
  className,
  children,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        bordered && "pb-4 border-b border-border",
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        {title && (typeof title === "string" ? <Text variant="title">{title}</Text> : title)}
        {description && (
          typeof description === "string"
            ? <Text variant="caption" className="mt-0.5">{description}</Text>
            : description
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── CardBody ─────────────────────────────────────────────────────────────────

interface CardBodyProps {
  padding?: CardPadding;
  className?: string;
  children: React.ReactNode;
}

export function CardBody({ padding = "md", className, children }: CardBodyProps) {
  return (
    <div className={cn(paddingClasses[padding], className)}>
      {children}
    </div>
  );
}

// ─── CardFooter ───────────────────────────────────────────────────────────────

interface CardFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function CardFooter({ className, children }: CardFooterProps) {
  return (
    <div className={cn("px-4 py-3 border-t border-border flex items-center gap-2", className)}>
      {children}
    </div>
  );
}

// ─── CardRow ──────────────────────────────────────────────────────────────────
// A bordered, hoverable list-item card row — the most common pattern in the app.
// Includes a hidden action area that reveals on hover (via group).

interface CardRowProps {
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function CardRow({ actions, className, children }: CardRowProps) {
  return (
    <div
      className={cn(
        "group flex items-start justify-between gap-3 p-4",
        "border border-border rounded-lg hover:border-border-strong transition-colors",
        className,
      )}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
}
