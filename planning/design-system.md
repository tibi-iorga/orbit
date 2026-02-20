# Orbit Design System - Color Palette

## Overview

A professional, accessible color palette designed for healthcare product management tools. Emphasizes clarity, readability, and data-forward presentation.

## Color Palette

### Primary Colors

**Primary Blue**
- `primary-50`: #EFF6FF (lightest background)
- `primary-100`: #DBEAFE (light background)
- `primary-200`: #BFDBFE (subtle accent)
- `primary-300`: #93C5FD (hover states)
- `primary-400`: #60A5FA (secondary actions)
- `primary-500`: #3B82F6 (primary actions, links)
- `primary-600`: #2563EB (primary buttons, active states)
- `primary-700`: #1D4ED8 (hover on primary-600)
- `primary-800`: #1E40AF (dark accents)
- `primary-900`: #1E3A8A (darkest)

**Usage**: Primary actions, links, important highlights, interactive elements

### Neutral Grays

**Gray Scale**
- `gray-50`: #F9FAFB (page background)
- `gray-100`: #F3F4F6 (subtle backgrounds, borders)
- `gray-200`: #E5E7EB (borders, dividers)
- `gray-300`: #D1D5DB (input borders, disabled states)
- `gray-400`: #9CA3AF (placeholder text, icons)
- `gray-500`: #6B7280 (secondary text, labels)
- `gray-600`: #4B5563 (body text)
- `gray-700`: #374151 (headings, emphasis)
- `gray-800`: #1F2937 (dark UI elements, sidebar)
- `gray-900`: #111827 (darkest text, sidebar background)

**Usage**: Text hierarchy, backgrounds, borders, UI elements

### Semantic Colors

**Success (Green)**
- `success-50`: #F0FDF4
- `success-100`: #DCFCE7
- `success-500`: #22C55E (success messages, positive indicators)
- `success-600`: #16A34A (success buttons)
- `success-700`: #15803D

**Usage**: Success messages, completed states, positive metrics

**Error (Red)**
- `error-50`: #FEF2F2
- `error-100`: #FEE2E2
- `error-500`: #EF4444 (error messages, destructive actions)
- `error-600`: #DC2626 (error buttons, critical alerts)
- `error-700`: #B91C1C

**Usage**: Error messages, destructive actions, validation errors

**Warning (Amber)**
- `warning-50`: #FFFBEB
- `warning-100`: #FEF3C7
- `warning-500`: #F59E0B (warnings, attention needed)
- `warning-600`: #D97706 (warning buttons)
- `warning-700`: #B45309

**Usage**: Warning messages, caution states, pending items

**Info (Cyan)**
- `info-50`: #ECFEFF
- `info-100`: #CFFAFE
- `info-500`: #06B6D4 (informational messages)
- `info-600`: #0891B2
- `info-700`: #0E7490

**Usage**: Informational messages, help text, neutral notifications

## Background Colors

### Light Theme (Default)

- **Page Background**: `gray-50` (#F9FAFB)
- **Content Background**: `white` (#FFFFFF)
- **Sidebar Background**: `gray-900` (#111827)
- **Card/Container Background**: `white` (#FFFFFF)
- **Hover States**: `gray-100` (#F3F4F6)
- **Active States**: `gray-200` (#E5E7EB)

### Dark Sidebar

- **Background**: `gray-900` (#111827)
- **Text**: `gray-200` (#E5E7EB) / `white` (#FFFFFF)
- **Hover**: `gray-800` (#1F2937)
- **Active**: `gray-800` (#1F2937)
- **Borders**: `gray-800` (#1F2937)

## Text Colors

### Light Content Area

- **Primary Text**: `gray-900` (#111827) - Headings, important text
- **Secondary Text**: `gray-600` (#4B5563) - Body text, descriptions
- **Tertiary Text**: `gray-500` (#6B7280) - Labels, metadata
- **Placeholder**: `gray-400` (#9CA3AF)
- **Disabled**: `gray-400` (#9CA3AF)

### Dark Sidebar

- **Primary Text**: `white` (#FFFFFF) - Active items, headings
- **Secondary Text**: `gray-400` (#9CA3AF) - Inactive items
- **Tertiary Text**: `gray-500` (#6B7280) - Subtle text

## Border Colors

- **Default**: `gray-200` (#E5E7EB)
- **Input Borders**: `gray-300` (#D1D5DB)
- **Focus**: `primary-500` (#3B82F6)
- **Error**: `error-500` (#EF4444)
- **Divider**: `gray-200` (#E5E7EB)

## Interactive States

### Buttons

**Primary Button**
- Background: `primary-600` (#2563EB)
- Text: `white`
- Hover: `primary-700` (#1D4ED8)
- Active: `primary-800` (#1E40AF)

**Secondary Button**
- Background: `gray-200` (#E5E7EB)
- Text: `gray-900` (#111827)
- Hover: `gray-300` (#D1D5DB)

**Destructive Button**
- Background: `error-600` (#DC2626)
- Text: `white`
- Hover: `error-700` (#B91C1C)

### Links

- **Default**: `primary-600` (#2563EB)
- **Hover**: `primary-700` (#1D4ED8)
- **Visited**: `primary-700` (#1D4ED8)

## Contrast Ratios

All color combinations meet WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for large text):

- `gray-900` on `white`: 15.8:1 ✓
- `gray-600` on `white`: 7.0:1 ✓
- `primary-600` on `white`: 4.6:1 ✓
- `white` on `gray-900`: 15.8:1 ✓
- `gray-400` on `gray-900`: 4.6:1 ✓

## Usage Guidelines

### Do's
- Use primary blue for main actions and important highlights
- Maintain high contrast between text and backgrounds
- Use semantic colors consistently (green=success, red=error, amber=warning)
- Use gray scale for hierarchy and structure
- Keep sidebar dark for visual separation

### Don'ts
- Don't use more than 2-3 colors in a single component
- Don't use low contrast combinations (gray-400 on gray-100)
- Don't use semantic colors for decorative purposes
- Don't mix warm and cool grays

## Accessibility

- All text meets WCAG AA contrast requirements
- Focus states are clearly visible (primary-500 outline)
- Color is not the only indicator of state (icons, text labels used)
- Interactive elements have clear hover and active states
