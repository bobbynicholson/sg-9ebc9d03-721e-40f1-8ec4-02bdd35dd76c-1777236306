---
name: CateringMS Admin
description: A clear, tenant-branded workspace for catering operations.
colors:
  primary: "var(--brand-primary)"
  secondary: "var(--brand-secondary)"
  tertiary: "var(--brand-accent)"
  neutral-bg: "#ffffff"
  neutral-ink: "#0f172a"
  neutral-muted: "#64748b"
  neutral-border: "#e2e8f0"
typography:
  display:
    fontFamily: "var(--brand-font-display, inherit)"
    fontSize: "clamp(28px, 2.5vw, 36px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--brand-font-body, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "14px"
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    height: "36px"
  card:
    backgroundColor: "{colors.neutral-bg}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.sm}"
---

# Design System: CateringMS Admin

## Overview

**Creative North Star: "The Tenant Service Desk"**

The admin workspace keeps a white canvas and familiar application typography, then uses each company's configured brand colors for primary actions, active filters, and small status accents. Content stays direct and information-dense so operators can scan a roster and take action without learning a new visual language.

The people directory places role filters beside the staff list on wide screens and stacks them on narrow screens. Its primary-role chip adds a brand-colored edge to distinguish the landing role while keeping the text readable against a light surface.

**Key Characteristics:**
- White page and card backgrounds.
- Tenant colors come from the existing brand variables.
- Heading and body fonts come from the company branding settings.
- Neutral borders and compact controls keep large rosters easy to scan.

## Colors

Brand accents are runtime values; neutral surfaces remain white and use slate-like text and dividers.

### Primary
- **Company Primary** (`var(--brand-primary)`): Main actions, selected role filters, and primary-role markers.

### Secondary
- **Company Secondary** (`var(--brand-secondary)`): Secondary emphasis and less frequent activity states.

### Tertiary
- **Company Accent** (`var(--brand-accent)`): Accent markers and invitation or aging-status details.

### Neutral
- **White Canvas** (`#ffffff`): Page, cards, fields, and dialogs.
- **Slate Ink** (`#0f172a`): Main text and role labels.
- **Muted Slate** (`#64748b`): Supporting copy and metadata.
- **Light Slate Border** (`#e2e8f0`): Card edges, dividers, and field outlines.

### Named Rules
**The Tenant Color Rule.** Use the active company's brand variables for actions and selected states; keep headings and long-form text on neutral colors for contrast.

## Typography

**Display Font:** Company-selected heading font (`var(--brand-font-display, inherit)`)
**Body Font:** Company-selected body font (`var(--brand-font-body, ui-sans-serif, system-ui, sans-serif)`)

**Character:** Keep the font pairing controlled by company branding. The admin UI may adjust size and weight for hierarchy, but does not introduce a route-specific typeface.

### Hierarchy
- **Display** (600, `clamp(28px, 2.5vw, 36px)`, 1.08 line height): Main page heading.
- **Headline** (700, 14–15px): Section and panel headings.
- **Title** (700–750, 12–13px): Staff names and compact card titles.
- **Body** (400, 14px, 1.5 line height): Explanatory copy and standard controls.
- **Label** (600–800, 9–12px): Status, counts, and role metadata.

### Named Rules
**The Company Type Rule.** Inherit heading and body faces from the tenant branding variables; do not add a font family in a page stylesheet.

## Layout

Admin pages use the shared navigation rail and a centered, fluid content area. The staff directory gives role overview a narrow companion column beside the roster on wide screens, then stacks the overview above the list below 1280px. At mobile widths, controls and rows become single-column and keep action targets easy to reach.

Use a compact spacing rhythm based on 8px steps, with 12–16px gaps inside cards and 24px around major sections.

## Elevation & Depth

Cards use thin borders and low, diffuse shadows to separate white surfaces from the page. The hierarchy remains visible without large shadows or colored page backgrounds.

### Shadow Vocabulary
- **Card edge** (`0 2px 8px rgb(15 23 42 / 4%)`): Subtle separation for roster and overview panels.

### Named Rules
**The White Surface Rule.** Keep page and primary content surfaces white; use borders and small tonal state cues for grouping.

## Shapes

Controls use modest rounded corners around 6px, grouped panels around 8–10px, and pill shapes only for compact statuses. Borders are thin and quiet. Avoid decorative silhouettes that compete with staff and access information.

## Components

### Buttons
- **Shape:** Compact rounded corners (6px) for standard actions.
- **Primary:** Company primary brand color with white text; use for the main page action and save/assign actions.
- **Hover / Focus:** Darken the active tenant primary slightly on hover; keep a visible focus ring derived from the same brand color.
- **Secondary:** White with a neutral border and company-colored text.

### Chips
- **Style:** Neutral chips use white or light slate; primary-role chips use a faint company-primary tint and a narrow primary-colored leading edge.
- **State:** Selected role filters use the company primary fill. Activity chips use primary, secondary, or accent tints according to state.

### Cards / Containers
- **Corner Style:** Gently rounded corners (8–10px).
- **Background:** White.
- **Shadow Strategy:** Low ambient shadow and a neutral border.
- **Border:** Light slate, 1px.
- **Internal Padding:** 14–16px.

### Inputs / Fields
- **Style:** White fill, light slate stroke, and compact rounded corners (6px).
- **Focus:** Brand-colored border and a soft brand-colored ring.
- **Error / Disabled:** Use established destructive and disabled component variants.

### Navigation
- **Style:** Retain the shared admin rail, its existing typography, and tenant-specific active brand treatment.

### Staff Role Chip
The directory's primary-role label uses the company primary as a narrow leading edge and pale tint. Role name text stays neutral for readability; a separate text label communicates primary and active-portal states.

## Do's and Don'ts

### Do:
- **Do** keep the page and main content surfaces white.
- **Do** read identity colors and heading/body fonts from company branding variables.
- **Do** use neutral text and borders for information that is not an action or status.
- **Do** keep primary and active role states distinguishable without relying on color alone.

### Don't:
- **Don't** add an unconfigured typeface to a tenant-facing page.
- **Don't** replace the company's brand colors with a fixed page palette.
- **Don't** use a tinted canvas behind the staff directory or its primary panels.
