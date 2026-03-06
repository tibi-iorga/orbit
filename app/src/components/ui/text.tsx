import React from "react";
import { cn } from "@/lib/cn";

// ─── Variant map ──────────────────────────────────────────────────────────────
// Each variant sets size + weight + color as a single token.
// Override colour per-use with the `color` prop.

const variantClasses = {
  display:    "text-3xl font-bold   tracking-tight text-content",
  heading:    "text-xl  font-semibold              text-content",
  subheading: "text-base font-semibold             text-content",
  title:      "text-sm  font-semibold              text-content",
  body:       "text-sm                             text-content",
  "body-sm":  "text-xs                             text-content",
  label:      "text-sm  font-medium                text-content",
  caption:    "text-xs                             text-content-muted",
  overline:   "text-xs  font-semibold uppercase tracking-wider text-content-subtle",
  code:       "font-mono text-xs bg-surface-subtle px-1.5 py-0.5 rounded text-content",
} as const;

export type TextVariant = keyof typeof variantClasses;

const colorClasses = {
  default: "",
  muted:   "text-content-muted",
  subtle:  "text-content-subtle",
  success: "text-success",
  warning: "text-warning",
  danger:  "text-danger",
  inherit: "text-inherit",
} as const;

export type TextColor = keyof typeof colorClasses;

// ─── Default HTML element per variant ─────────────────────────────────────────

const defaultElement: Record<TextVariant, React.ElementType> = {
  display:    "h1",
  heading:    "h2",
  subheading: "h3",
  title:      "p",
  body:       "p",
  "body-sm":  "p",
  label:      "span",
  caption:    "span",
  overline:   "span",
  code:       "code",
};

// ─── Component ────────────────────────────────────────────────────────────────

type AsProp<E extends React.ElementType> = { as?: E };
type PropsOf<E extends React.ElementType> = React.ComponentPropsWithRef<E>;

type TextOwnProps = {
  variant?: TextVariant;
  color?: TextColor;
  truncate?: boolean;
  clamp?: 1 | 2 | 3;
  className?: string;
  children?: React.ReactNode;
};

// Merge with the underlying element's props
type TextProps<E extends React.ElementType = "p"> =
  TextOwnProps & AsProp<E> & Omit<PropsOf<E>, keyof TextOwnProps | "as">;

export function Text<E extends React.ElementType = "p">({
  as,
  variant = "body",
  color,
  truncate,
  clamp,
  className,
  children,
  ...props
}: TextProps<E>) {
  const Element = as ?? defaultElement[variant];
  return (
    <Element
      className={cn(
        variantClasses[variant],
        color && colorClasses[color],
        truncate && "truncate",
        clamp === 1 && "line-clamp-1",
        clamp === 2 && "line-clamp-2",
        clamp === 3 && "line-clamp-3",
        className,
      )}
      {...props}
    >
      {children}
    </Element>
  );
}
