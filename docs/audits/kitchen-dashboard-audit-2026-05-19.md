# `/team-portal/kitchen/dashboard` audit (2026-05-19)

**Scope:** 42nd page. Kitchen staff dashboard.

**File:** `src/pages/team-portal/kitchen/dashboard.tsx` (1,091 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| KIT2-1 | Kitchen-only scope enforced. Realtime via cateringms:order-updated event. ✓ | none |
| KIT2-2 | sales_admin admitted to canSeeAdminOrderDetail role check. Should be read-only per dispatch DI-10 - remove sales_admin from kitchen's admin-only gates. | P2 |
| KIT2-3 | **Bobby's explicit ask: "kitchen should see cleaning schedule".** Kitchen dashboard has no link to /team-portal/cleaning. MyShiftTodayCard includes "kitchen_and_cleaning" shifts but no surface CTA. | **P1** |
| KIT2-4 | No `@ts-nocheck`. Orders properly typed. ✓ | none |
| KIT2-5 | Allergen check fires before markOrderReady. ✓ | none |
| KIT2-6 | Prep checklist (TaskCompletionButtons) hidden inside `<details>` collapsible per order. On a 10+ order day this is friction. | P2 |
| KIT2-7 | Orders query loads 3 days. No pagination on the 3-day window. | P2 |
| KIT2-8 | Force-close panel correctly gated to admin-only. ✓ | none |
| KIT2-9 | Kanban + hot-hold alert design solid. ✓ | none |

## First-wave PRs
- KIT2-A: Add "Cleaning schedule" CTA to kitchen dashboard (KIT2-3, P1) - **ships in this push**
- KIT2-B: Promote prep checklist out of collapsible (KIT2-6)
- KIT2-C: Pagination + server-side limit on orders load (KIT2-7)
- KIT2-D: Remove sales_admin from kitchen admin gates (KIT2-2)
