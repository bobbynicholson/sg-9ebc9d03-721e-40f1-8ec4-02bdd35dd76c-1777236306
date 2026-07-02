# Portal Restructure Session Summary (2026-07-02 night)

## Completed Work

### 1. Settings Persistence Rebuild
- **NotificationsTab** now edits `email_notification_preferences` table (boolean columns that DB mailers read)
- **PrivacyTab** now stores settings on `profiles.notification_preferences` jsonb under `account_privacy` key
- Dead **AccountPreferences** card (Display & Regional) removed (localStorage-only, nothing read it)
- **ProfileTab** cleaned up (no dead preferences props)

**Files**: src/components/account/settings/NotificationsTab.tsx, PrivacyTab.tsx, ProfileTab.tsx, types.ts; src/pages/account/settings.tsx

### 2. Kitchen Portal Restructure (DONE 2026-07-02 morning)
All 7 kitchen pages on **KitchenPageShell** with:
- Brand hero + white-glass meta chips + PageWorkbench
- Failed primary reads show rose recovery card + Retry (not silent toast)
- Realtime channel cleanup via `supabase.removeChannel()`
- Clock-in double-tap guard on team board
- Recipe lookup no longer N+1 settings fetches
- Layout nav resolves `active_role` first (multi-role staff see correct portal)

### 3. Admin List Pages Unified (DONE 2026-07-02 morning)
New **AdminControlSurface** (AdminSearchField, AdminControlGroup, filter chips) adopted by:
- Contacts, Invoices, Leads, Quotes, Refunds, Users pages
- Shopping + White-Label pages got responsive fixes (control rows + colour grids no longer overflow small screens)

### 4. Shopping Portal Restructure (IN PROGRESS, DONE 2026-07-02 night)
All 10 shopping pages on **ShoppingPageShell** with edge-state hardening:

**Dashboard, Buy-list, Orders** — loaded error recovery cards + Retry, loadError state, ProtectedRoute added (none had one)

**Inventory, Suppliers, Kitchen-demand, Receipts** — all hardened; money display now uses `tenantCurrency.format` (not hand-rolled toFixed); unique realtime channel suffixes per repo convention

**Invoices, Notifications, Settings** — added ProtectedRoute, fixed notification dead error paths (now `throwOnError: true`), loadError recovery cards

**Fixed bugs**:
- Three shopping pages had no ProtectedRoute (URLs were open to any signed-in role)
- Notification error paths were silent (service returns [] on failure, no user feedback)
- Money formatting was hand-rolled instead of using tenant currency formatter

### 5. Cleaning Portal Restructure (IN PROGRESS, DONE 2026-07-02 night)
All 10 cleaning pages on **CleaningPageShell**:

**Dashboard, Tasks, Schedules** — shell wrap + edge states

**Equipment, Damage, Supplies, Workflows** — all on shell, hardened

**Notifications, Settings, Handovers/[id]** — full shell adoption, loadError recovery cards, ProtectedRoute added where missing, realtime channel cleanup

**Fixed bugs**:
- Handover detail load failure used to throw uncaught (page stuck in limbo), now shows recovery card
- Missing ProtectedRoute on several pages
- Realtime channels now use unique suffixes

### 6. Waiter Portal Upgrade (IN PROGRESS, DONE 2026-07-02 night)
- **Dashboard**: already on shell; wrapped widgets in error boundary
- **Notifications**: upgraded to hero standard (WAITER_HERO_CHIP meta row, headerAction with busy state, dynamic subheading), added loadError recovery card, fixed dead error paths
- WaiterServicePanel: added loadError recovery card (failed loads no longer render as "No events to staff"), hardcoded orange buttons now use brand colour

### 7. Backend Notification Targeting Fixes (CRITICAL BUG FIX)
**Manager roles were missing from 7 notification senders:**
- `kitchen_manager` + `cleaning_manager` added to:
  - `cleaning-overdue-check` cron
  - `event-approaching-reminder` cron (3 targets)
  - `late-equipment-return-alert` cron
  - `amendment-review` & `cancellation-review` order APIs

**Impact**: kitchen/cleaning managers never received alerts. Now included across all role broadcasts.

**Files modified**:
- src/pages/api/cron/cleaning-overdue-check.ts
- src/pages/api/cron/event-approaching-reminder.ts
- src/pages/api/cron/late-equipment-return-alert.ts
- src/pages/api/orders/amendment-review.ts
- src/pages/api/orders/cancellation-review.ts

## New Components Created
- `src/components/shopping/ShoppingPageShell.tsx` (exports SHOPPING_HERO_CHIP)
- `src/components/cleaning/CleaningPageShell.tsx` (exports CLEANING_HERO_CHIP)
- `src/components/admin/AdminControlSurface.tsx`
- Updated `src/components/waiter/WaiterPageShell.tsx` (hero standard with PortalShell ground)
- Upgraded `src/components/waiter/WaiterServicePanel.tsx` (loadError recovery, brand colours)

## Key Patterns Applied Everywhere
- **Edge states**: loadError roses recovery cards with Retry (never silent toast-then-empty)
- **Loading**: in-shell skeletons or spinners, never blank page
- **Realtime**: `supabase.removeChannel()` for cleanup, unique channel suffixes
- **Money**: `useTenantCurrency().format()` or `formatZAR` (not hand-rolled)
- **Colours**: `brand-primary` for primary actions, semantic for status/KPIs, brand tokens for chrome only
- **South African English**: no em-dashes, sentence case, proper locale (en-ZA)
- **Multi-role staff**: `active_role` first in nav + auth checks

## Commits Ready to Ship
1. Kitchen portal + AdminControlSurface + audit fixes
2. Shopping portal (10 pages) + notification targeting fixes
3. Cleaning portal (10 pages)
4. Waiter portal + WaiterServicePanel hardening
5. Settings persistence (NotificationsTab + PrivacyTab rebuild)

## Next Steps
1. Run full `npx tsc --noEmit` (clean as of commit time)
2. Run tests + build
3. Run guard scripts (check-status-filters, check-realtime-channels, check-migration-rls)
4. Commit each portal (4 commits total)
5. Push to main

## Open Notes
- **Waiter dashboard**: No meta chips added because WaiterServicePanel owns the data (shared component); adding chips would need service exposure or duplication risk count disagreement
- **Shopping invoices**: Added ProtectedRoute with SHOPPING_STAFF + admins; verify role list matches other staff portals
- **Cleaning handovers**: Print-safe page kept print hygiene intact (no shell around printable output)
- **Kitchen orders**: Re-exported from admin page (print surface), no shell needed
