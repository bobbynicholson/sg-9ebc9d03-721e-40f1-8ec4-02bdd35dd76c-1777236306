# Responsive breakpoints — house rules

Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.

The whole admin / platform / portal layout sits **behind a fixed left
sidebar** that activates at `lg`. That changes the rules a bit:

| Breakpoint | Sidebar | What the page should do |
|---|---|---|
| `< lg` (mobile / tablet) | Hidden, hamburger top bar instead | Use the full viewport. Page content needs `pt-16` to clear the mobile top bar. |
| `lg` ≥ 1024px | Visible, fixed `lg:w-64` (256px) | Page wrapper needs `lg:pl-64` so content doesn't sit under the sidebar. |
| `xl` ≥ 1280px | Visible, fixed `xl:w-72` (288px) | Wrapper needs `xl:pl-72`. |

So the canonical wrapper for any page that ships with `<AdminNav />`,
`<PlatformNav />`, or one of the team navs is:

```tsx
<div className="min-h-screen bg-... lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
  <PlatformNav /> {/* or AdminNav, DriverNav, etc. */}
  <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
    {/* page content */}
  </div>
</div>
```

## Heading + action-bar pattern

Page headers usually have a title on the left and 1-3 controls on the right
(date filter, refresh, primary CTA). At narrow widths those controls have to
wrap. Use this pattern, **not** a single `flex items-center justify-between`:

```tsx
<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6 sm:mb-8">
  <div className="min-w-0">
    <h2 className="text-2xl md:text-3xl xl:text-4xl font-bold ...">Title</h2>
    <p className="text-sm sm:text-base text-slate-600 mt-1">Subtitle</p>
  </div>
  <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:flex-shrink-0">
    {/* controls */}
  </div>
</div>
```

`min-w-0` on the title block prevents it being squeezed when a sidebar narrows
the available width. `flex-wrap` on the controls block lets buttons drop to a
second row on `md` rather than overflowing.

## Stat-card grids

Stat tiles look terrible at 2xx px wide. Use:

- 1-2 stats: `grid-cols-1 md:grid-cols-2`
- 3-4 stats: `grid-cols-2 lg:grid-cols-4`
- 5 stats: `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`

Tile font sizes:
- Number: `text-xl md:text-2xl` (default), `text-2xl md:text-3xl` for hero
- Label: `text-xs uppercase tracking-wide text-slate-500`
- Sublabel: `text-xs text-slate-500 mt-0.5`

## Buttons / icons-only on small screens

If a button has both an icon and a label, hide the label on mobile:

```tsx
<Button>
  <RefreshCw className="h-4 w-4 mr-2" />
  <span className="hidden sm:inline">Refresh</span>
</Button>
```

## Tables

Wrap in `<div className="overflow-x-auto">`. Don't try to make data tables
collapse to cards on mobile — it always looks worse than letting them scroll.

## Mobile top bar height

Every nav uses `fixed top-0 left-0 right-0 z-50` for the mobile top bar with
`px-4 py-3` padding. That's roughly **64px tall**, hence `pt-16` on the page
wrapper. Don't reduce that padding without updating every page.

## Don't use dark mode classes for now

`forcedTheme="light"` is set in `ThemeProvider`. `dark:` classes still compile
fine, leave them in place — when we ship the dark theme pass they'll come on
together.

## Container width — full-width with scaling padding

Logged-in pages live behind a fixed sidebar, so every spare pixel inside the
content area is valuable. Don't cap content at `max-w-7xl` (1280px) — on a
1900px laptop with the 256px sidebar that leaves ~180px of dead space on each
side. The agreed cap is **`max-w-screen-2xl`** (1536px), which still keeps
text readable on huge displays but uses roughly the full visible width on a
1080p / 1440p laptop.

**Standard inner container:**

```tsx
<div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">
  {/* page content */}
</div>
```

If a page renders a wide chart, map, or kanban board that genuinely benefits
from edge-to-edge width, drop the cap entirely:

```tsx
<div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
  {/* full-bleed content */}
</div>
```

Padding scales: `px-4` on mobile (16px), `sm:px-6` on small (24px), and
optionally `lg:px-8 xl:px-12` for full-bleed pages.

## When you add a new page or a new component to a page

1. Make sure the outer wrapper has `lg:pl-64 xl:pl-72 pt-16 lg:pt-0`.
2. Use `<PortalNav />` (or AdminNav etc.) at the top of the JSX, not in a
   layout HOC — pages are easier to grep that way.
3. Test at 360px (mobile), 768px (tablet), 1024px (laptop), and 1440px+ (desktop).
4. Tile grids: pick from the patterns above; don't invent new column counts.
5. Heading row: use the flex-col → lg:flex-row pattern; don't put `justify-between`
   on a row that has a long title.
