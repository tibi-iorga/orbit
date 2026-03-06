import React from "react";
import { cn } from "@/lib/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

// Deterministic colour from a string (name or id)
const PALETTE = [
  "bg-blue-100   text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-green-100  text-green-700",
  "bg-amber-100  text-amber-700",
  "bg-rose-100   text-rose-700",
  "bg-cyan-100   text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-teal-100   text-teal-700",
];

function hashIndex(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xff;
  return h % PALETTE.length;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, size = "sm", className }: AvatarProps) {
  const colour = PALETTE[hashIndex(name)];
  return (
    <span
      aria-label={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold select-none shrink-0",
        sizeClasses[size],
        colour,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
