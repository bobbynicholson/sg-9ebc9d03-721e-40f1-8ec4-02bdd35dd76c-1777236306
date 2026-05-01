# CateringMS UI conventions

**Audience:** anyone touching the front-end. Bobby asked for this so the
team stays consistent as we ship more pages. Treat it as a working
playbook, not a constitution. Update it when we discover a new pattern
worth lifting.

---

## 1. Voice and copy

The hard rules from `CLAUDE.md` apply to every string a user can read,
including tooltip text, toast messages, email templates and JSX.

- **Never use em dashes (—).** Anywhere. Ever.
- **Never use double hyphens (--) in user-visible strings.** Code
  comments are fine; rendered copy is not.
- Replace either with periods, commas or rephrasing.
- South African English: "colour", "centre", "organise", "fulfil",
  "enquiry".
- No corporate filler ("leverage", "synergy", "circle back", "moving
  forward") and no AI clichés ("certainly", "absolutely", "great
  question", "I'd be happy to").
- Avoid emojis unless explicitly requested.

The dash-stripping pass lives at `scripts/strip_dashes.py` and can be
re-run any time we suspect drift.

---

## 2. Buttons

Standard families used across the platform. Match these where you can,
add new ones to this section if you must.

| Use case                              | Variant         | Class hints                                              |
| ------------------------------------- | --------------- | -------------------------------------------------------- |
| Primary action (Save, Send, Confirm)  | `default`       | brand gradient or `bg-emerald-600` for compose actions   |
| Secondary action                      | `outline`       | default tone                                             |
| Destructive (Delete, Cancel booking)  | `ghost` + rose  | `text-rose-600 hover:text-rose-700 hover:bg-rose-50`     |
| Tertiary / row-level                  | `outline` `sm`  | small height, paired with an icon                        |
| Sticky save bar (System Settings)     | `default` amber | `bg-amber-500 hover:bg-amber-400 text-slate-900`         |
| AI-driven action                      | `outline` purple| chip with `Bot` icon when relevant                       |

Lucide icons go on the left of the label, sized `w-4 h-4` for
`size="sm"` and `w-5 h-5` for default. Always include `aria-label` /
`title` when the button is icon-only.

---

## 3. Compose flows (Quotes, Leads, anywhere we send email)

There is exactly **one** compose drawer pattern. Both Quote Management
and Lead Management use it. Future surfaces (Clients CRM nudges, after-
sales emails) should follow it too.

```
src/components/messaging/ComposeDrawerHost.tsx   <-- chrome (resizable)
src/components/messaging/MessageComposer.tsx     <-- form + send actions
```

Rules:

- Drawer slides in from the right. Default width is 60% of the
  viewport, clamped to 480..1280px. Drag handle on the left edge
  resizes; width persists for the session in `sessionStorage`.
- Header has an icon, a title and an optional subtitle.
- Optional `banner` slot above the form for context (diary signal,
  lost-deal hint, expired warning).
- Optional `controls` slot below the banner for tweakable inputs that
  re-render the body template (e.g. sweetener offer picker).
- Two-column layout when the drawer is wide: composer on the left,
  context card on the right rail (`This quote`, `This lead`, etc.).
- Subject and body live in the composer's local state. Once the user
  types in either, we stop overwriting from external template changes.
- Four send channels, always in this order: **Gmail**, **Outlook**,
  **Default mail app**, **Copy**. Gmail is `bg-emerald-600`, the rest
  are `outline`. Disabled when there's no recipient email.
- A tiny coming-soon line under the buttons mentioning direct send.
- Always end with a full-width `ghost` Close button.

If you find yourself wanting to deviate, talk it out, then update this
section.

---

## 4. Tables and lists

- Real `<table>` surfaces use the click-to-sort header pattern from
  `src/lib/useSortable.ts` and `src/components/ui/sort-header.tsx`.
- Card-grid surfaces use the same hook plus the dropdown
  `src/components/ui/sort-menu.tsx` so the operator gets a `Sort by`
  affordance even when there's no header to click.
- Empty states get a centred icon + a short headline + one CTA.
- Filter pills go above the search input. Active pill is filled, idle
  pills are outlined. Pill counts are baked into the label.

---

## 5. Sticky / save patterns

System-level edit pages (System Settings, future profile / branding)
should:

- Track a `savedSnapshot` of the last-persisted state.
- Compute a `hasUnsavedChanges` flag from the current state vs the
  snapshot.
- Render a small `Unsaved changes` chip and an amber Save button at
  the top.
- Drop a sticky bottom save bar that appears the moment the form is
  dirty and disappears on save.
- Add a `beforeunload` guard that warns if the user tries to leave
  with unsaved edits.

Live-edit pages (Quote Builder, Order details modal) auto-save in the
background; sticky chrome isn't needed.

---

## 6. Tooltips

- Use the shared `<InfoTooltip content="..." />` component
  (`src/components/ui/info-tooltip.tsx`).
- Place a tooltip next to every stat card label, every section header
  the operator might not understand, and every wizard step pill.
- Tooltip copy is one or two sentences max. Use `\n\n` for paragraph
  breaks.
- Don't repeat the visible label inside the tooltip.

---

## 7. Tenant scoping

- Every Supabase query inside a tenant page must include
  `.eq("company_id", profile.company_id)` or rely on RLS that does the
  same. Never trust a request body for `company_id`.
- API endpoints take `company_id` from the authenticated session, not
  the body.
- Don't link from the platform admin sidebar to a per-tenant route
  (that's how we leaked metrics into Spit Braai's dashboard once).

---

## 8. AI usage

- Mapper: Haiku (cheap), one round trip per sheet, tool-use forced
  JSON. `process.env.ANTHROPIC_IMPORT_MODEL` overrides.
- Receipt vision: Sonnet 4.5, one image per call, tool-use forced.
  `process.env.ANTHROPIC_RECEIPT_MODEL` overrides.
- Row repair: Haiku, on demand only, triggered by an operator clicking
  `AI repair` on a flagged preview row.
  `process.env.ANTHROPIC_REPAIR_MODEL` overrides if a stuck job needs
  Sonnet.
- Never log the operator's data to Anthropic without explicit consent
  metadata. Anthropic's no-train policy is the default for production
  traffic; we don't opt back in.

---

## 9. Footer behaviour

- Authenticated dashboards push the footer below the fold via the
  `Footer` component's spacer. Don't override.
- Public marketing pages (`/`, `/pricing`, `/features`) render the
  footer in normal flow.

---

## 10. New file conventions

- TypeScript everywhere. New code without explicit types fails review.
- One default export per page; named exports for everything else.
- Comment the why, not the what. Every non-trivial helper gets a short
  preamble explaining why it exists.
- File-level JSDoc on every page tells the next developer what the
  page does and what to be careful about (tenant scoping, RLS,
  cost-conscious API calls, etc.).

---

## 11. Reviewing changes

Before merging anything, run through this checklist:

- [ ] No em dashes or `--` in user-visible strings.
- [ ] Compose flows use the shared drawer + MessageComposer.
- [ ] Tables have a sort affordance.
- [ ] Edit pages have a sticky save bar (or auto-save).
- [ ] Tooltips on every section / stat / wizard step.
- [ ] Tenant scoping on every Supabase call.
- [ ] No new top-level `any` types unless commented why.

If anything in here gets out of date because we shipped a better
pattern, update this doc in the same PR.
