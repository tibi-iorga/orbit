import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Semantic tokens — driven by CSS custom properties in globals.css ──
        // To retheme: change the RGB values in :root, these classes update automatically.
        // Supports opacity: bg-brand/50, text-content-muted/80, etc.
        brand: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          hover:   "rgb(var(--color-brand-hover) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          muted:   "rgb(var(--color-surface-muted) / <alpha-value>)",
          subtle:  "rgb(var(--color-surface-subtle) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          strong:  "rgb(var(--color-border-strong) / <alpha-value>)",
        },
        content: {
          DEFAULT: "rgb(var(--color-content) / <alpha-value>)",
          muted:   "rgb(var(--color-content-muted) / <alpha-value>)",
          subtle:  "rgb(var(--color-content-subtle) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
          bg:      "rgb(var(--color-success-bg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          bg:      "rgb(var(--color-warning-bg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          bg:      "rgb(var(--color-danger-bg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
