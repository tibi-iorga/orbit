"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:   "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border-strong text-gray-700 bg-surface hover:bg-surface-muted",
  ghost:     "text-content-subtle hover:text-content hover:bg-surface-subtle",
  danger:    "border border-red-200 text-danger bg-surface hover:bg-danger-bg",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm:   "px-3 py-1.5 text-sm rounded gap-1.5",
  md:   "px-4 py-2 text-sm rounded-lg gap-2",
  icon: "p-1.5 rounded",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>{typeof children === "string" ? children.replace(/…$/, "") + "…" : children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
