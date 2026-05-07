# CateringMS megaprogramme Phase 5 (architecture cleanup) closeout

**Date:** 2026-05-07
**Branch:** `phase-5-arch/megaprogramme-2026-05` (off `phase-4/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** [phase 1](megaprogramme-2026-05-phase-1.md) · [phase 2](megaprogramme-2026-05-phase-2.md) · [phase 3](megaprogramme-2026-05-phase-3.md) · [phase 4](megaprogramme-2026-05-phase-4.md)

## Disposition summary

First of the six character-grouped follow-up PRs queued in the Phase 4
closeout. Architecture cleanup -- foundational hygiene, picked first
to clear friction for the UI-sweep, driver-fleet, Xero, and tenant-
health groups still queued.

- **3 items shipped** (BrandingContext removal, PortalSidebar
  consolidation, ts-nocheck removal partial)
- **2 items deferred** to focused follow-ups (P2-13 file splits,
  P2-10 remaining 12 services)

## What landed in Phase 5

| ID | Title | Commit |
|---|---|---|
| P1-30 | Delete `BrandingContext`, write white-label directly to `companies` | `5ebb041` |
| P1-31 | Collapse 4 staff portal navs into config-driven `<PortalSidebar />` | `7e0fbce` |
| P2-10 (partial) | Remove `@ts-nocheck` from `profileService` + `roleService` | `9e53759` |

3 items, 3 commits.

## P1-30 -- BrandingContext removal

The audit flagged BrandingContext as duplicating `companies.*` writes.
Three other writers (`admin/settings.tsx`, `admin/platform/company-
database.tsx`, `account/settings.tsx`) updated `company_name` /
`logo_url` directly without going through the context, so the
context's localStorage cache + DOM CSS variables silently drifted
out of sync.

Replaced the React context with a thinner pattern:
- `src/lib/branding/applyBranding.ts` -- pure DOM helpers
  (`applyBrandingToDOM`, `isWhiteLabelRow`, `BrandingRow` type,
  `DEFAULT_PALETTE`).
- `src/lib/branding/store.ts` -- module-level pub/sub store for
  the active tenant's branding row, with localStorage cache helpers.
- `src/lib/branding/useBranding.ts` -- React reader hook
  (`useBrandingRow`, `useIsWhiteLabeled`).
- `src/components/TenantBrandingApplier.tsx` -- side-effect-only
  component mounted once in `_app.tsx`. Owns the fetch + DOM-apply +
  cache lifecycle. Listens for `branding:updated` custom events so
  the white-label admin save triggers live re-paint without context
  state.

Wiring:
- `_app.tsx` swaps `<BrandingProvider>` for
  `<TenantBrandingApplier initialBranding={...} />`.
- `Footer.tsx` reads via `useBrandingRow()`.
- `admin/white-label.tsx` writes directly to `companies` and
  dispatches `branding:updated`.
- `src/contexts/BrandingContext.tsx` and `src/types/whitelabel.ts`
  deleted.

`companies` is now the single canonical source of truth for white-
label fields. The other 3 writers no longer have a parallel state
container to fall out of sync with.

## P1-31 -- PortalSidebar consolidation

The 4 staff portal navs (Kitchen / Driver / Shopping / Cleaning)
were ~95% identical -- each ~390 LOC, diverging only in icons,
accent gradient, header copy, storage key prefix, mobile quick
actions, and section data.

New `<PortalSidebar config={...} />` in
`src/components/navigation/PortalSidebar.tsx` (~360 LOC) takes a
typed `PortalSidebarConfig` and renders the entire sidebar -- mobile
sheet drawer + desktop collapse + scroll restore + slug-aware hrefs
+ active-route matching. Each role file (KitchenNav, DriverNav,
ShoppingNav, CleaningNav) is now an ~80-line shim with just the
config object.

Net: **4 nav files at 1,565 LOC + the `client/ClientNav.tsx` orphan
(deleted, migrated subscription-invoices.tsx to the canonical
`navigation/ClientNav`) -> 1 PortalSidebar (~360 LOC) + 4 thin
configs (~320 LOC).** ~885 LOC removed.

`navigation/ClientNav.tsx` stayed bespoke -- its data flow pulls
from auth profile and ships a custom mobile drawer rather than
Sheet, so consolidating it adds risk without proportional gain.
Queued for a follow-up.

## P2-10 -- ts-nocheck removal (partial)

Removed `// @ts-nocheck` from `src/services/profileService.ts` and
`src/services/roleService.ts`. Both surfaced real findings:

- `profileService.createProfile` was dead code that tried to insert
  three columns (`subscription_status`, `subscription_plan`,
  `trial_ends_at`) that don't exist on the `profiles` table.
  Deleted entirely. Zero callers across the codebase.
- `roleService.getRoleDisplayName` had stale Record keys (`owner`,
  `kitchen`, `shopping`, `cleaning`, `staff`) that don't exist in
  the current `UserRole` enum. Replaced with the live enum keys.

The audit scoped this to "14 money/auth services". The remaining 12
(`subscriptionService`, `paymentLedgerService`, `paymentProcessing-
Service`, `billingEmailService`, `xeroIntegrationService`, `invoice-
Service`, `companyService`, `userManagementService`, `onboarding-
Service`, plus the rest) will each surface their own latent type
issues; doing them in one commit batches risk badly. Each gets its
own commit in a focused follow-up.

## What's still deferred

- **P2-13 file splits** -- `admin/orders.tsx` (2,442 LOC),
  `admin/settings.tsx` (1,241), `account/settings.tsx` (1,087),
  `admin/platform/company-database.tsx` (1,057),
  `admin/inventory-tracking.tsx` (886). 6,713 LOC of mechanical
  splits across 5 files, each its own logical-boundary decision.
  Better as 5 separate small PRs with operator review per split
  than one batched commit.
- **P2-10 remaining 12 services** -- one ts-nocheck removal per
  commit, each with its surfaced findings fixed inline. Same shape
  as the two shipped here.

## What's next

The remaining five character-grouped PR groups from the Phase 4
closeout are still queued. Recommended order:

1. ~~Architecture cleanup (this PR)~~ done
2. UI consistency sweep (P2-09, P2-11, P2-16, P2-17, P2-18, P1-29)
3. Driver fleet (P1-07 / P1-08 / P1-18 / P1-34 / P1-37)
4. Xero / accounting (P1-20 / P1-21 / P1-24)
5. Skylight tenant health (P1-32 / P2-15)
6. Polish trickle (P1-23 / P2-01 / P2-04)

Plus the two deferrals from this phase (P2-13 splits and the P2-10
remainder).

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).
