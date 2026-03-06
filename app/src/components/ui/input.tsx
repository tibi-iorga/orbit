"use client";

import React from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-content rounded-lg " +
  "placeholder:text-content-subtle " +
  "focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, className)} {...props} />
));
Select.displayName = "Select";
