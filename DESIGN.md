---
name: CateringMS
description: Premium catering operations software for admin, client, kitchen, cleaning, shopping, driver, and platform portals.
colors:
  surface-page: "#f8fafc"
  surface-card: "#ffffff"
  ink: "#0f172a"
  ink-muted: "#475569"
  border-soft: "#e2e8f0"
  brand-primary: "#d97706"
  brand-secondary: "#ea580c"
  brand-accent: "#f59e0b"
  success: "#047857"
  warning: "#b45309"
  danger: "#be123c"
typography:
  headline:
    fontFamily: "var(--brand-font-display, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "var(--brand-font-body, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "var(--brand-font-body, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "var(--brand-font-body, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: CateringMS

## 1. Overview

**Creative North Star: "Calm Operations Desk"**

CateringMS is product UI first. The interface should feel like a clear operating desk for a catering company, not a promotional website. The visual system uses restrained surfaces, a single brand accent, strong information grouping, and consistent role-specific navigation so users can work fast without relearning each portal.

The app must make operational data easy to understand. Headers should explain the page's job, cards should identify source and time window, and empty states should tell the user what needs to exist before data appears.

**Key Characteristics:**
- Dense but calm authenticated pages.
- Shared portal shell, headers, cards, stat tiles, loading states, and empty states.
- Brand accents used for selection, primary action, status, and live urgency.
- Sentence-case labels and direct UX copy.
- No decorative gradient text or generic dashboard hero patterns.

## 2. Colors

The palette is a restrained slate operating surface with tenant-controlled amber/orange brand accents.

### Primary
- **Tenant amber** (#d97706): Tenant brand primary. Use for identity, selected state, and controlled emphasis.
- **Tenant orange** (#ea580c): Secondary tenant accent. Use only where a brand gradient or paired identity treatment already exists.

### Secondary
- **Action ink** (#0f172a): Main product action colour for default buttons and high-contrast text.

### Tertiary
- **Signal colours** (#047857, #b45309, #be123c): Success, warning, and danger. Always pair with readable labels.

### Neutral
- **Page slate** (#f8fafc): Authenticated app background.
- **Card white** (#ffffff): Main content surfaces.
- **Muted ink** (#475569): Supporting copy, never primary body copy on tinted backgrounds.
- **Soft border** (#e2e8f0): Hairline separators and card borders.

**The Accent Budget Rule.** Brand accent should stay under roughly 10 percent of an operational screen. If everything is amber, nothing is urgent.

## 3. Typography

**Display Font:** Tenant heading font through `--brand-font-display`, falling back to the app sans stack.
**Body Font:** Tenant body font through `--brand-font-body`, falling back to `ui-sans-serif, system-ui, sans-serif`.
**Label/Mono Font:** Use tabular figures for metrics, prices, counts, and timers.

**Character:** Product typography is steady and practical. Use weight, spacing, and grouping before increasing size.

### Hierarchy
- **Headline** (600, 24-30px, tight line-height): Page headers and primary section titles.
- **Title** (600, 16px): Card titles, modal headings, table group labels.
- **Body** (400, 14-16px): Operational explanations and table text.
- **Label** (500, 12px): Metadata, tabs, filters, and helper labels. Use sentence case.

**The No Truncation Rule.** Do not truncate page titles or important explanatory subtitles. Wrap them cleanly.

## 4. Elevation

CateringMS uses tonal layering plus a quiet two-part shadow: a tight contact shadow and a soft ambient shadow. Shadows are used to separate actionable surfaces, not decorate the page.

### Shadow Vocabulary
- **Portal card** (`0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -16px rgba(15,23,42,0.12)`): Default panels and stat tiles.
- **Interactive lift** (`0 2px 4px rgba(15,23,42,0.05), 0 16px 40px -18px rgba(15,23,42,0.22)`): Hover state for clickable cards only.

**The Flat Rail Rule.** Sidebars and nav rails rely on active states and spacing, not heavy shadows.

## 5. Components

### Buttons
- **Shape:** Rounded-md, 36px high by default, 44px minimum for icon-only touch targets.
- **Primary:** High-contrast action ink or approved brand treatment.
- **Hover / Focus:** Subtle colour shift, visible focus ring, and press feedback using transform.
- **Secondary / Ghost:** Use for filters, utility actions, and non-primary commands.

### Chips
- **Style:** Small rounded rectangles with clear border, background, and text contrast.
- **State:** A selected chip should read as selected through text and fill, not colour alone.

### Cards / Containers
- **Corner Style:** Portal cards use rounded-2xl because this is already established in the app system.
- **Background:** White or dark slate surface. Avoid nested cards where spacing and dividers are enough.
- **Shadow Strategy:** Use the portal card shadow. Avoid random one-off shadows.
- **Internal Padding:** 16px on compact mobile cards, 20-24px on standard panels.

### Inputs / Fields
- **Style:** Visible label, rounded-md border, readable placeholder, and accessible focus ring.
- **Focus:** Ring or border shift, no layout movement.
- **Error / Disabled:** Explain what happened and how to fix it.

### Navigation
- **Style:** Shared `PortalSidebar` for admin and team portals. Every row needs a clear title, a short description where useful, and live badge copy that explains urgency.
- **Mobile:** Drawer keeps search, smart quick actions, and the same sections as desktop.

### Portal Header
Use `PortalHeader` for operational pages. Title states the page. Subtitle explains the data or workflow. Actions belong on the right and wrap on mobile.

## 6. Do's and Don'ts

### Do:
- **Do** use `PortalShell`, `PortalHeader`, `PortalCard`, `PortalCardHeader`, `StatTile`, `EmptyState`, and skeleton primitives before making custom page chrome.
- **Do** explain operational data with source, owner, and time window.
- **Do** use sentence-case labels and role-specific nouns consistently.
- **Do** pair status colours with text or icons.
- **Do** keep live operations pages dense enough for repeated use.

### Don't:
- **Don't** use gradient text in product UI.
- **Don't** create vague "Coming soon" pages without a useful interim action or explanation.
- **Don't** bury kitchen, cleaning, shopping, driver, and client data under generic "Dashboard" labels when a clearer noun exists.
- **Don't** use large marketing hero sections inside authenticated portals.
- **Don't** make a new card style when the shared portal card covers the job.
