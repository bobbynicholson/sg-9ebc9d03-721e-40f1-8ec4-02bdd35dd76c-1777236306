# CateringMS megaprogramme Phase 6 (UI consistency sweep) closeout

**Date:** 2026-05-07
**Branch:** `phase-6-ui/megaprogramme-2026-05` (off `phase-5-arch/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** [phase 1](megaprogramme-2026-05-phase-1.md) · [phase 2](megaprogramme-2026-05-phase-2.md) · [phase 3](megaprogramme-2026-05-phase-3.md) · [phase 4](megaprogramme-2026-05-phase-4.md) · [phase 5 arch](megaprogramme-2026-05-phase-5-arch.md)

## Disposition summary

Second of the six character-grouped follow-up PRs queued in the Phase 4
closeout. The full UI consistency sweep across primitive adoption,
import hygiene, expiry chips, and touch / a11y compliance.

- **6 items shipped** -- everything in the UI sweep group except
  P1-29 (form validation) which is deferred as the L-effort outlier
- **1 item deferred** (P1-29 react-hook-form + zod sweep)

## What landed in Phase 6

| ID | Title | Commit |
|---|---|---|
| P2-11 | Strip 103 unused lucide-react icon imports across 65 files | `e41310c` |
| P2-09 | Adopt EmptyState primitive on menu, suppliers, contacts list pages | `d1d2722` |
| P2-16 | MetricCard primitive on shopping / kitchen / driver dashboards | `e5613a9` |
| P2-18 | Expiry chip on `/q/[token]` + `/pay/i/[token]` public pages | `fa60f09` |
| P2-04 + P2-17 | 44px touch targets + aria-labels on team-portal chrome | `ce02f46` |

5 items, 5 commits (P2-04 + P2-17 bundled because both touched the
same Button + PortalSidebar primitives).

## P2-11 -- lucide-react import hygiene

Wrote `.scripts/strip-unused-lucide.mjs`, a small parser that walks
every `import { ... } from "lucide-react"` line, intersects with
references in the file body, and rewrites the line with only the
used icons (or removes it entirely). Idempotent, touches only the
import line.

**103 unused icon imports stripped from 65 files.** Net -347 LOC.

The script stays in `.scripts/` so future drift is one `node` away.

## P2-09 -- EmptyState adoption

Three high-traffic admin list pages now use the canonical EmptyState
primitive that landed in Phase 2 (P1-26):

- `admin/menu.tsx` -- "No menu items yet" / "No matches" branches
- `admin/suppliers/index.tsx` -- "No suppliers yet" / "No suppliers
  match this view" branches with conditional add-supplier CTA
- `admin/contacts.tsx` -- "No contacts yet" / "No contacts in this
  view" branches with conditional add-contact CTA

Each uses the audit-spec'd shape: centred icon + headline + one CTA,
inside the existing list Card so the visual rhythm matches the rest
of the page. `admin/clients.tsx` is just a redirect to contacts and
needed no change.

## P2-16 -- MetricCard adoption

Three of the four team-portal dashboards now use the canonical
`<MetricCard />` primitive for their stat tile grids:

- `team-portal/shopping/dashboard.tsx` -- 4 tiles (Total / Pending /
  Purchased / Urgent)
- `team-portal/kitchen/dashboard.tsx` -- 4 tiles (Today's Orders /
  Total Guests / In Prep / Ready)
- `team-portal/driver/dashboard.tsx` -- 4 tiles (Today's Jobs /
  Completed / Pending / Earnings)

12 bespoke `<Card><CardContent>` tile blocks collapsed into 12
MetricCard prop calls. Net -128 LOC across the three files; tooltip
content + InfoTooltip parity preserved exactly.

`team-portal/cleaning/dashboard.tsx` left bespoke. Its 4-tile stat
grid is nested *inside* a styled outer Card with a gradient
("Equipment Status Overview") rather than standing alone, so
swapping in MetricCard would either double-nest Cards or change the
visual treatment. Queued for a focused follow-up if Bobby wants the
cleaning dashboard to drop its custom outer-Card framing.

## P2-18 -- public token expiry chips

The audit flagged that `/q/[token]` and `/pay/i/[token]` showed
expiry only as fine print at the bottom of the page. New top-bar
chip surfaces it before the user scrolls:

- `/q/[token]` -- "Expires in N days" / "Expires today" / "Expired
  [date]" with stone (>3 days) / amber (≤3 days) / red (expired)
  tones. Hidden once the quote is accepted.
- `/pay/i/[token]` -- "Due in N days" / "Due today" / "Overdue by
  N days" with the same tonal scheme. Hidden once the invoice is
  paid.

Both pull from data already loaded (`quote.valid_until` /
`invoice.due_date`) so no service / API change.

## P2-04 + P2-17 -- touch targets + a11y

Bumped `Button` size="icon" from `h-9 w-9` (36px) to `h-11 w-11`
(44px) so every icon-only button across the site meets the >=44px
touch-target rule. Affects ~50 icon buttons including the
PortalSidebar mobile menu trigger, NotificationBell, and the
sidebar collapse toggle -- exactly the controls the kitchen tablet
operator and driver phone touch most. Visual on desktop is barely
perceptible (icons stay the same size; the hover background ring
gets slightly larger).

Added aria-labels to icon-only chrome buttons that lacked them:

- PortalSidebar mobile menu trigger -- `aria-label="Open
  navigation menu"`
- PortalSidebar sidebar collapse toggle -- `aria-label` reflects
  state ("Expand sidebar" / "Collapse sidebar") + `aria-expanded`
- NotificationBell -- `aria-label="Notifications"` or
  `"Notifications, N unread"` when unread count > 0

A more exhaustive a11y sweep (every team-portal page,
focus-visible verification, keyboard nav across custom dropdowns)
is outside the scope of one commit; what landed here is the chrome
that every team-portal session touches first.

## What's still deferred

- **P1-29 react-hook-form + zod sweep** -- L-effort outlier from
  the UI consistency group. The audit lists "form validation
  patterns scattered" -- adopting react-hook-form + zod across the
  forms (admin/settings, white-label, supplier dialog, contacts
  add/edit, ...) is its own multi-PR effort.
- **Cleaning dashboard MetricCard** -- gated on a UX decision
  (drop the gradient outer-Card framing or keep bespoke).

## What's next

Three more character-grouped PR groups left from the Phase 4
closeout. Recommended order:

1. ~~Architecture cleanup~~ done in Phase 5
2. ~~UI consistency sweep~~ done in Phase 6 (this PR)
3. Driver fleet (P1-07 / P1-08 / P1-18 / P1-34 / P1-37)
4. Xero / accounting (P1-20 / P1-21 / P1-24)
5. Skylight tenant health (P1-32 / P2-15)
6. Polish trickle (P1-23 / P2-01 / P2-04)

Plus the deferrals: P1-29, the cleaning dashboard upgrade, P2-13
file splits (Phase 5 deferral), and the P2-10 ts-nocheck remainder
(Phase 5 deferral).

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).
